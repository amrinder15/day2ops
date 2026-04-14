---
title: "Closing the GitOps Feedback Loop: Flux Status in Azure DevOps Without Cluster Access"
description: "Your Flux sync completed. Your Azure DevOps pipeline has no idea. Here's how we built a lightweight notification bridge using Flux's Notification Controller and a custom webhook receiver — zero direct cluster access required."
date: 2024-10-22
tags: ["gitops", "flux", "azure-devops", "kubernetes", "platform"]
featured: false
author: "Day2Ops"
---

The GitOps dream: you merge a PR, and within minutes your change is live in the cluster. The nightmare version: you merge a PR, the pipeline goes green, and then you have no idea whether Flux actually reconciled your Helm chart successfully — or silently drifted into an error state while you were writing the deployment ticket.

This is the "green pipeline problem." Your CI system sees a successful image push or a successful manifest commit. But Kubernetes — and Flux — live on the other side of a network boundary your pipeline can't cross. Without solving this, teams end up checking `flux get helmreleases` manually, or worse, discovering failures in production metrics.

## The constraint

In many enterprise setups (and ours is no exception), CI/CD pipelines run in a separate VNET from the AKS cluster. Firewall rules prohibit direct `kubectl` or Flux CLI access from the pipeline. You can push to Git. You cannot reach the Kubernetes API server.

This rules out the naive solution: "just run `flux reconcile` and check the output." You can't run it from the pipeline.

## The architecture

The solution lives entirely inside the cluster:

```
[Pipeline pushes to Git]
        ↓
[Flux detects change, reconciles HelmRelease]
        ↓
[Flux Notification Controller fires alert]
        ↓
[Azure DevOps webhook receiver in-cluster]
        ↓
[Azure DevOps REST API — update pipeline status]
```

No outbound pipeline-to-cluster traffic. Only inbound cluster-to-Azure-DevOps webhooks.

## Step 1: Flux Alert configuration

Flux's Notification Controller can send alerts on any event — reconciliation success, failure, drift detection. We target `HelmRelease` objects specifically:

```yaml
apiVersion: notification.toolkit.fluxcd.io/v1
kind: Provider
metadata:
  name: azure-devops-webhook
  namespace: flux-system
spec:
  type: generic-hmac
  address: https://RECEIVER_SERVICE_URL/hook/flux-status
  secretRef:
    name: webhook-hmac-secret

---
apiVersion: notification.toolkit.fluxcd.io/v1
kind: Alert
metadata:
  name: helmrelease-status
  namespace: flux-system
spec:
  summary: "HelmRelease reconciliation status"
  providerRef:
    name: azure-devops-webhook
  eventSeverity: info
  eventSources:
    - kind: HelmRelease
      name: '*'
      namespace: '*'
```

The `generic-hmac` provider signs the payload with HMAC-SHA256 using the shared secret, so our receiver can verify authenticity.

## Step 2: The webhook receiver

We deployed a small Go service inside the cluster that:

1. Verifies the HMAC signature
2. Parses the Flux event payload
3. Calls the Azure DevOps REST API to post a build/deployment status update

The core handler:

```go
func (h *Handler) handleFluxEvent(w http.ResponseWriter, r *http.Request) {
    // Verify HMAC
    sig := r.Header.Get("X-Hub-Signature-256")
    body, err := io.ReadAll(r.Body)
    if err != nil || !h.verifyHMAC(body, sig) {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    var event FluxEvent
    if err := json.Unmarshal(body, &event); err != nil {
        http.Error(w, "bad request", http.StatusBadRequest)
        return
    }

    // Map Flux severity to Azure DevOps status
    adoStatus := mapFluxStatusToADO(event.Severity, event.Reason)

    if err := h.adoClient.PostDeploymentStatus(r.Context(), adoStatus, event); err != nil {
        h.log.Error("failed to post ADO status", "err", err)
        http.Error(w, "internal error", http.StatusInternalServerError)
        return
    }

    w.WriteHeader(http.StatusAccepted)
}

func mapFluxStatusToADO(severity, reason string) string {
    if severity == "error" {
        return "failed"
    }
    if reason == "ReconciliationSucceeded" {
        return "succeeded"
    }
    return "inProgress"
}
```

## Step 3: Azure DevOps pipeline picks up the status

With the status posted to ADO's deployment tracking API, your pipeline can poll for the final state or display it as a pipeline annotation. Teams get their green checkmark — but now it represents an actual Flux reconciliation, not just a Git push.

## What we learned

- **HMAC verification is non-negotiable.** An unauthenticated webhook endpoint in your cluster is a lateral movement vector. Sign everything.
- **Idempotency matters.** Flux can fire multiple events for a single reconciliation. Your receiver needs to handle duplicate events gracefully.
- **The receiver is a critical path component.** If it goes down, you lose visibility but not function. Add a PodDisruptionBudget and a liveness probe.

The full receiver implementation is open-sourced in our [platform-tools repo](https://github.com).

---

*Next post: we'll cover how we extended this pattern to emit DORA metrics from Flux events, giving us deployment frequency and lead time for free.*
