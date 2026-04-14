---
title: "Day 2 Kubernetes: The Operational Debt You Didn't Know You Signed Up For"
description: "Deploying to Kubernetes is the easy part. This post covers the operational realities of running clusters long-term — upgrades, certificate rotation, node pool management, and building the muscle memory your platform team needs to stay sane."
date: 2026-03-18
tags: [kubernetes, day2, platform, sre, observability]
heroImage: "/images/k8s-day2.png"
heroImageAlt: "Abstract infrastructure topology diagram"
heroImageFit: "contain"
readingTime: 5
author: "Amrinder Rattanpal"
---

Every team has a Day 1 Kubernetes story. You pick a managed service — EKS, GKE, AKS — spin up a cluster, push the first workload, and celebrate. The YAML sprawl is manageable. The dashboards are green. Life is good.

Then six months pass.

You realise the control plane is two minor versions behind. A certificate rotation went missing in someone's runbook. The node pool still has the same instance type from the proof-of-concept. Three engineers have left, and the one person who understands the cluster bootstrap process is on parental leave.

Welcome to Day 2.

## What is "Day 2"?

The term comes from lifecycle thinking in ops-heavy domains:

- **Day 0** — Architecture and design decisions
- **Day 1** — Initial provisioning and deployment
- **Day 2** — Everything that happens after: upgrades, patching, scaling, incident response, capacity planning, team enablement

Day 2 is where most of the engineering time is actually spent, and yet it's chronically under-resourced. Teams over-invest in Day 1 tooling and under-invest in operability.

## The Kubernetes Day 2 Problem Space

Let's break down the common failure modes:

### 1. Cluster Upgrade Debt

Kubernetes releases a minor version roughly every four months. Each minor version is supported for about 14 months. If you're not upgrading on a cadence, you will eventually hit end-of-life on an in-use API or lose managed-service support.

The trap: upgrades are not risky in theory. They are risky in practice because:

- Deprecated APIs (`networking.k8s.io/v1beta1`, anyone?) break existing manifests
- Node disruption during upgrades affects stateful workloads if PodDisruptionBudgets aren't set
- The team has never actually *done* an upgrade in production, so the first attempt is during an incident

**The fix:** Establish a quarterly upgrade cadence. Automate the node pool drain/replace cycle. Test upgrades in a staging cluster that mirrors production topology, not just workloads. Track API deprecations with `pluto` or `kubent`.

```bash
# Check for deprecated APIs in your cluster
kubent --target-version 1.29

# Or with pluto in your Helm charts
pluto detect-helm -o wide --target-versions k8s=v1.29.0
```

### 2. Certificate Expiry: The Silent Killer

kubeadm-provisioned clusters create certificates with a default 1-year expiry. Managed Kubernetes services rotate these automatically — mostly. But admission webhooks, in-cluster CAs, and mTLS sidecars often have certs managed separately, and they silently expire at 2 AM on a Saturday.

```bash
# Check control plane cert expiry (kubeadm clusters)
kubeadm certs check-expiration

# For cert-manager managed certs
kubectl get certificate -A -o jsonpath='{range .items[*]}{.metadata.namespace}/{.metadata.name}: {.status.notAfter}{"\n"}{end}'
```

> **Tip:** Alert at 30 days, 14 days, and 3 days. Automate renewal where possible. Keep a manual runbook for cases where automation fails — and test that runbook once a year.

### 3. Observability Gaps

You have metrics. You have logs. You probably don't have:

- SLOs defined for the platform itself (not just the apps on it)
- Alerts that page on symptoms, not causes
- A clear ownership matrix for "who gets paged if the cluster API server is slow"

The observability maturity model for platform teams:

| Level | What you have |
| ------- | -------------- |
| 0 | No metrics, manual checking |
| 1 | Basic Prometheus scraping, no alerts |
| 2 | Alerts on resource exhaustion |
| 3 | Symptom-based alerts, SLOs defined |
| 4 | Error budget tracking, automated incident correlation |

Most teams are at level 2 and think they're at level 3.

### 4. Node Pool Sprawl

The PoC node pool lives forever. The "temporary" GPU nodes from last quarter are still running. The `t3.medium` instances that were fine for 5 developers are now struggling under 50 services.

Treat node pools like code: version them, review them, delete the ones you no longer need. Use labels and taints deliberately. Separate system workloads from application workloads.

```yaml
# Dedicated node pool for system workloads
apiVersion: v1
kind: Node
metadata:
  labels:
    node-role: system
spec:
  taints:
  - key: "node-role"
    value: "system"
    effect: "NoSchedule"
```

Then tolerate it only in your platform components:

```yaml
tolerations:
- key: "node-role"
  operator: "Equal"
  value: "system"
  effect: "NoSchedule"
```

## Building Operational Muscle Memory

The teams that operate Kubernetes well aren't smarter — they have **runbooks, automation, and a culture of practicing failure**.

### Runbook Requirements

Every tier-1 incident scenario should have a runbook that:

1. Describes the symptom (not just the cause)
2. Lists the first three things to check
3. Explains how to mitigate *without* understanding root cause
4. Points to where to find more information

### Regular Game Days

Schedule a 2-hour game day every quarter. Pick a failure scenario — node pool drain, etcd backup restore, certificate rotation — and actually do it in a non-production environment. The goal is not to prevent the scenario; it's to reduce the mean time to resolve when it happens in production.

### Capacity Review Cadence

Kubernetes doesn't magically scale forever. Review cluster capacity monthly:

```bash
# Node resource utilisation summary
kubectl top nodes

# Namespace resource consumption
kubectl resource-capacity --sort cpu.util --pod-count
```

Track trends, not just snapshots. If CPU utilisation is 40% today but grew 5% month-over-month, you have eight months before you hit saturation. That's plenty of time — but only if you're looking.

## A Day 2 Maturity Checklist

Before you call your Kubernetes platform "production-ready," ask:

- [ ] Is there an upgrade cadence documented and scheduled?
- [ ] Are all certificate expiries monitored with advance alerts?
- [ ] Are SLOs defined for the platform (API server latency, scheduling queue, etc.)?
- [ ] Is etcd backed up and the restore procedure tested?
- [ ] Are PodDisruptionBudgets set for every critical workload?
- [ ] Is there a runbook for every tier-1 on-call scenario?
- [ ] Is the cluster bootstrap process documented and reproducible by anyone on the team?
- [ ] Are resource quotas and LimitRanges applied to every namespace?
- [ ] Is there a process for deprecating and deleting unused node pools?

If you answered "no" to more than three of these, you have Day 2 debt. That's not a criticism — almost everyone does. The first step is acknowledging it.

## Closing Thoughts

Kubernetes gave us incredible primitives for deploying and scaling software. But it shifted operational complexity rather than eliminating it. The teams that thrive are the ones that invest in Day 2 from the moment they go to production — not after the first outage.

Start small: pick one item from the checklist above and fix it this sprint. Then pick another one next sprint. Compounded over a few quarters, you'll have a platform your developers trust and your on-call rotation doesn't dread.

Because the real goal of platform engineering isn't deploying software. It's ensuring that three engineers can keep a production platform running reliably for a hundred developers — at 2 AM — without heroics.

That's the craft of Day 2.
