---
title: "Day 2 Operations: What Nobody Tells You About Running a Platform at Scale"
description: "You shipped the platform. Kubernetes is running, Terraform state is clean, and the dashboards look green. Then Monday happens. This is everything we learned the hard way about operating infrastructure after go-live."
date: 2024-11-15
tags: ["day2", "platform", "kubernetes", "sre", "observability"]
heroImage: "/images/hero-day2.svg"
heroImageAlt: "Abstract infrastructure topology diagram"
featured: true
author: "Day2Ops"
---

Everyone talks about Day 0 and Day 1. The architecture diagrams. The Terraform modules. The Helm chart refactoring. The three-week sprint to get Kubernetes "production-ready."

Nobody prepares you for Day 2.

Day 2 is the monday after go-live. It's the 3 AM PagerDuty alert six weeks in. It's the developer asking why their pod keeps OOMKilling even though their memory request looks fine. Day 2 is **operations** — the sustained, unglamorous, humbling work of keeping complex systems alive and improving them under real load.

This post distills two years of hard-won lessons from running a multi-tenant platform serving ~200 engineering teams.

---

## 1. Your Runbooks Are Already Stale

You wrote them during the build phase. They describe a system that no longer exists.

Runbooks decay faster than source code because there's no CI pipeline for them. No one gets a PR review for "added step 4b to the cert rotation runbook." By the time an incident forces someone to actually _use_ that runbook, it's referencing a `kubectl` flag that was deprecated, a Vault path that moved, or a manual step that's been automated — but only on the team lead's machine.

**What actually works:**

```bash
# Make runbooks executable. Literally.
# runbooks/cert-rotation.sh — the doc IS the script.

#!/usr/bin/env bash
set -euo pipefail

NAMESPACE="${1:?Usage: cert-rotation.sh <namespace>}"
SECRET_NAME="${2:?Missing secret name}"

echo "🔍 Checking current cert expiry..."
kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" \
  -o jsonpath='{.data.tls\.crt}' | base64 -d | \
  openssl x509 -noout -enddate

echo "♻️  Triggering cert-manager renewal..."
kubectl annotate certificate "$SECRET_NAME" \
  -n "$NAMESPACE" \
  cert-manager.io/issuer-kind=ClusterIssuer \
  --overwrite

echo "⏳ Waiting for new cert (up to 120s)..."
kubectl wait certificate/"$SECRET_NAME" \
  -n "$NAMESPACE" \
  --for=condition=Ready \
  --timeout=120s

echo "✅ Done. New expiry:"
kubectl get secret "$SECRET_NAME" -n "$NAMESPACE" \
  -o jsonpath='{.data.tls\.crt}' | base64 -d | \
  openssl x509 -noout -enddate
```

When your runbook is a script, it either works or it fails loudly. That's honest. Markdown runbooks with "run this command" are lies waiting to be told.

---

## 2. The Metrics You Dashboarded Are Not The Metrics You Need

After go-live, every team builds a Grafana dashboard. It's practically a rite of passage. CPU. Memory. Request rate. Error rate. These feel important because they're the first things that turn red.

Six months in, you realize they tell you what broke — not why, and not what's about to break.

The metrics that actually saved us during incidents:

| Metric | Why It Matters |
|---|---|
| `kube_pod_container_resource_limits` vs actual usage | Sizing drift — teams over-request by 300% on average |
| `etcd_request_duration_seconds_bucket` p99 | First signal before the API server starts degrading |
| `container_oom_events_total` | Silent memory pressure that never pages |
| Node allocatable pressure (not node CPU %) | Scheduler pressure that causes mysterious pending pods |
| Webhook admission latency | The most invisible bottleneck in large clusters |

> **Callout — The OOM Trap:** A pod that OOMKills doesn't always generate a clear alert. It restarts. The restart counter increments. If your restart threshold is "5 in 10 minutes," a pod restarting every 45 minutes is invisible. Set alerts on `kube_pod_container_status_last_terminated_reason == "OOMKilled"` with a 24-hour lookback. You'll be surprised what you find.

---

## 3. Blast Radius Is a Design Document

When you're building, you optimize for developer experience. Small, independent components. Fast iteration. This is correct.

When you're operating, you optimize for _contained failure_. These goals conflict, and nobody tells you how to balance them.

Here's our rubric:

```yaml
# In every service's deployment annotations:
metadata:
  annotations:
    platform.day2ops.dev/blast-radius: "team"      # team | namespace | cluster
    platform.day2ops.dev/failure-mode: "graceful"  # graceful | hard | cascades
    platform.day2ops.dev/on-call-tier: "p2"        # p1 | p2 | p3
```

"Blast radius: team" means if this service fails completely, only one team is affected. "Blast radius: cluster" means an incident brief gets written. This annotation forces every team to reason about their failure modes at deploy time, not at 2 AM.

We added this to our admission webhook — it's a required annotation. The conversations it sparked were more valuable than the annotation itself.

---

## 4. Toil Is Technical Debt With a Human Cost

The SRE concept of "toil" is well-defined: manual, repetitive, automatable work that scales with system size. What's less discussed is the compounding human cost.

On our team, toil took the form of:

- **Namespace provisioning**: ~45 minutes per team, entirely manual, done 3–5 times per week
- **Secret rotation**: 2 hours per service, ad hoc, triggered by expiry alerts
- **PVC resizing**: Blocked on a human approving a StorageClass override, tickets open for days

After 8 months, we measured: **~22% of the on-call engineer's week was pure toil**. That's not sustainable, and more importantly, it's not fair to the humans doing it.

The fix wasn't fancy. We built a Backstage scaffolder template for namespace provisioning. We added external-secrets-operator for secret rotation. We wrote a small controller for PVC resize approval workflows.

```yaml
# The simplest toil-elimination wins:
# Before: manual kubectl + Jira ticket + Slack approval
# After: ArgoCD ApplicationSet + policy-as-code

apiVersion: argoproj.io/v1alpha1
kind: ApplicationSet
metadata:
  name: team-namespaces
spec:
  generators:
    - git:
        repoURL: https://github.com/org/platform-config
        revision: HEAD
        directories:
          - path: teams/*/namespace
  template:
    metadata:
      name: '{{path.basenameNormalized}}-namespace'
    spec:
      project: platform
      source:
        repoURL: https://github.com/org/platform-config
        targetRevision: HEAD
        path: '{{path}}'
      destination:
        server: https://kubernetes.default.svc
      syncPolicy:
        automated:
          prune: true
          selfHeal: true
```

The rule we adopted: **if an on-call engineer does the same task twice, it goes on the automation backlog immediately.** Not "when we have time." Now.

---

## 5. Incident Reviews Are Where Culture Lives

You can tell everything about an engineering organization by how they run postmortems.

The failure mode we see most often: postmortems that become blame documents. They technically use blameless language ("the engineer," not "Alice") but the underlying structure still implies a human caused the outage. This poisons the culture slowly. Engineers start playing defense in incidents rather than solving problems.

What changed our postmortems:

**Old structure:**
1. Timeline
2. Root cause
3. Action items

**New structure:**
1. What did the system do? (not: what did the person do)
2. What did humans learn _during_ the incident that they didn't know before?
3. What made this harder to diagnose than it should have been?
4. Action items that change _the system_, not _the behavior_

The third question is the most valuable. "We couldn't tell which deployment caused the latency spike because we don't have deploy events in our metrics timeline" — that's a systemic gap. Close it.

---

## Looking Forward

Day 2 never ends. That's not a depressing thought — it's the actual job. Platforms aren't projects; they're products. They require sustained investment, honest measurement, and teams that are empowered to fix what's broken without waiting for a rewrite.

The teams we've seen succeed at Day 2 share one trait: they treat operations as a first-class engineering discipline, not a tax on "real work."

If you're early in your Day 2 journey, start here:
1. Make your runbooks executable scripts
2. Add blast-radius annotations to every workload
3. Measure your toil ratio this week
4. Change the third question in your next postmortem

The dashboards will still be green. But now you'll know why.

---

_Have a Day 2 war story? Drop it in the comments — the best lessons in this field come from shared failure._
