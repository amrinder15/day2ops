---
title: "Closing the GitOps Feedback Loop: Flux Notifications in Azure DevOps"
description: "When Flux reconciles your Helm chart, your pipeline has already finished. Here's how to get that green checkmark back in your CI without giving the cluster direct API access."
date: 2024-10-08
tags: ["gitops", "flux", "kubernetes", "azure-devops", "platform"]
featured: false
draft: true
readingTime: 3
author: "Day2Ops"
---

The problem is deceptively simple: you commit a change, the Azure DevOps pipeline turns green, and then... nothing. Flux eventually reconciles the change into the cluster. Or it doesn't. You find out when a developer asks why their feature isn't deployed.

This is the GitOps observability gap — the disconnect between "the pipeline passed" and "the cluster is actually running the new version."

Here's how we closed it.

## The Architecture

Flux has a built-in notification system via the `notification-controller`. The key insight is that the controller can post outbound webhooks — you don't need anything in the cluster to reach _in_ to Azure DevOps.

```
Git push → ADO Pipeline (fast, stateless)
              ↓
          HelmRelease / Kustomization committed
              ↓
          Flux reconciles (async, minutes later)
              ↓
          Notification Controller → ADO REST API
              ↓
          Pipeline status updated ✅
```

The `generic-hmac` provider is the right primitive here — it posts a signed JSON payload to any HTTP endpoint, including Azure DevOps pipeline update APIs.

## Setting Up the Provider

First, create the HMAC secret:

```bash
kubectl create secret generic ado-webhook-secret \
  --from-literal=token="$(openssl rand -hex 32)" \
  -n flux-system
```

Then the provider:

```yaml
apiVersion: notification.toolkit.fluxcd.io/v1beta3
kind: Provider
metadata:
  name: azure-devops
  namespace: flux-system
spec:
  type: generic-hmac
  address: https://dev.azure.com/<org>/<project>/_apis/distributedtask/hubs/build/plans/<planId>/events?api-version=2.0
  secretRef:
    name: ado-webhook-secret
```

## The Alert

The `Alert` resource watches specific sources and fires the provider on key events:

```yaml
apiVersion: notification.toolkit.fluxcd.io/v1beta3
kind: Alert
metadata:
  name: helm-release-status
  namespace: flux-system
spec:
  summary: "Flux HelmRelease reconciliation status"
  providerRef:
    name: azure-devops
  eventSeverity: info
  eventSources:
    - kind: HelmRelease
      name: "*"           # Watch all HelmReleases in the namespace
      namespace: production
  inclusionList:
    - ".*succeeded.*"
    - ".*failed.*"
    - ".*stalled.*"
```

The `inclusionList` is important — without it, you'll get flooded with intermediate events. We only care about terminal states.

## Receiving the Payload

On the Azure DevOps side, you need a pipeline that listens for the webhook and updates the original run. The payload from Flux looks like:

```json
{
  "involvedObject": {
    "kind": "HelmRelease",
    "name": "my-app",
    "namespace": "production"
  },
  "reason": "ReconciliationSucceeded",
  "message": "Release reconciliation succeeded",
  "metadata": {
    "revision": "1.4.2+abc1234"
  },
  "severity": "info",
  "timestamp": "2024-10-08T14:32:11Z"
}
```

Parse `reason` to determine pass/fail, and use the `revision` field to correlate back to your original commit.

## The Real-World Gotcha

The `planId` in the webhook URL is dynamic — it's specific to each pipeline run. You need to store it somewhere Flux can retrieve it per-deployment.

Our solution: during the pipeline run, we write the `planId` and `jobId` to a ConfigMap in the cluster as part of the deploy step:

```yaml
- script: |
    kubectl create configmap pipeline-context-$(Build.BuildId) \
      --from-literal=planId=$(System.PlanId) \
      --from-literal=jobId=$(System.JobId) \
      --from-literal=buildId=$(Build.BuildId) \
      -n flux-system \
      --dry-run=client -o yaml | kubectl apply -f -
  displayName: 'Store pipeline context'
```

Then a small controller watches for `HelmRelease` reconciliation events, reads the matching ConfigMap, and posts back to ADO. This decouples the correlation logic from Flux itself.

## Was It Worth It?

Yes — but with caveats.

The feedback loop closure is valuable. Developers now see a Flux reconciliation status directly on their PR/deployment. On-call engineers can tell within seconds whether a rollback is actually applied.

The operational overhead is real though. The pipeline-context ConfigMap cleanup, the HMAC rotation, and the ADO API pagination quirks all need maintenance. Budget 2–3 sprints to get this production-hardened.

For teams with fewer than 5 deployments per day, a simpler approach — a scheduled check via `flux get helmreleases` in a follow-up pipeline stage — might be sufficient. Don't over-engineer the feedback loop before you understand your actual delay tolerance.

---

_Next up: how we built a custom `controller-runtime` controller to handle more complex reconciliation status aggregation._
