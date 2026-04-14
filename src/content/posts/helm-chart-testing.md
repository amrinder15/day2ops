---
title: "Testing Helm Charts Like You Mean It"
description: "Unit tests, schema validation, integration tests with kind, and golden-file rendering tests. A complete testing pyramid for Helm charts that catches real bugs before they reach your cluster."
date: 2024-08-05
tags: ["helm", "kubernetes", "testing", "gitops", "platform"]
featured: false
author: "Day2Ops"
---

Most Helm chart testing stops at `helm lint`. Lint checks syntax. It does not check that your `Values` schema is enforced, that your RBAC bindings are correct, or that a HPA and a VPA on the same Deployment don't create thrashing.

Here's a practical testing pyramid for charts that ships real bugs to dev, not production.

## Layer 1: Schema validation (`values.schema.json`)

Every chart should have a schema. Without one, `helm install` accepts any values and fails silently or cryptically at runtime.

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "type": "object",
  "required": ["image", "service"],
  "properties": {
    "replicaCount": {
      "type": "integer",
      "minimum": 1,
      "maximum": 50
    },
    "image": {
      "type": "object",
      "required": ["repository", "tag"],
      "properties": {
        "repository": { "type": "string" },
        "tag": { "type": "string" },
        "pullPolicy": {
          "type": "string",
          "enum": ["Always", "Never", "IfNotPresent"]
        }
      }
    }
  }
}
```

Validate in CI:

```bash
helm lint charts/my-app --values charts/my-app/values.yaml
helm lint charts/my-app --values charts/my-app/values-test.yaml
```

## Layer 2: Template unit tests with helm-unittest

[helm-unittest](https://github.com/helm-unittest/helm-unittest) lets you write unit tests against rendered templates:

```yaml
# charts/my-app/tests/deployment_test.yaml
suite: deployment tests
templates:
  - deployment.yaml
tests:
  - it: should set correct replica count
    set:
      replicaCount: 3
    asserts:
      - equal:
          path: spec.replicas
          value: 3

  - it: should not set resource limits when not configured
    set:
      resources: {}
    asserts:
      - notExists:
          path: spec.template.spec.containers[0].resources.limits

  - it: should set anti-affinity when enabled
    set:
      affinity.podAntiAffinity.enabled: true
    asserts:
      - isNotNull:
          path: spec.template.spec.affinity.podAntiAffinity
```

Run in CI:

```bash
helm plugin install https://github.com/helm-unittest/helm-unittest
helm unittest charts/my-app
```

## Layer 3: Golden file tests

Golden files let you snapshot the full rendered output of a chart and fail the test if it changes unexpectedly. Useful for catching accidental template regressions:

```bash
#!/usr/bin/env bash
set -euo pipefail

CHART="charts/my-app"
GOLDEN_DIR="charts/my-app/golden"
VALUES="charts/my-app/values.yaml"

# Render
RENDERED=$(helm template test-release "$CHART" -f "$VALUES")

# Compare or update
if [[ "${UPDATE_GOLDEN:-false}" == "true" ]]; then
  echo "$RENDERED" > "$GOLDEN_DIR/default.yaml"
  echo "Updated golden file."
else
  diff <(echo "$RENDERED") "$GOLDEN_DIR/default.yaml" || {
    echo "Golden file mismatch! Run with UPDATE_GOLDEN=true to update."
    exit 1
  }
fi
```

When a template change is intentional, run `UPDATE_GOLDEN=true make test-charts` and commit the updated golden file.

## Layer 4: Integration tests with kind

For charts that define CRDs, complex RBAC, or multi-resource interactions, render-only tests aren't enough. We run a full integration test against a `kind` cluster in CI:

```yaml
# .github/workflows/chart-integration.yaml (or equivalent ADO pipeline)
steps:
  - name: Create kind cluster
    run: kind create cluster --config .kind/config.yaml

  - name: Install chart
    run: |
      helm install my-app charts/my-app \
        --values charts/my-app/values.yaml \
        --wait \
        --timeout 3m

  - name: Verify deployment is healthy
    run: |
      kubectl rollout status deployment/my-app --timeout=2m
      kubectl get pods -l app.kubernetes.io/name=my-app

  - name: Run smoke tests
    run: |
      kubectl run smoke-test \
        --image=curlimages/curl:latest \
        --restart=Never \
        --rm \
        -it \
        -- curl -sf http://my-app/healthz
```

Integration tests are slow (~4 minutes) but they catch the bugs that unit tests miss: service selectors that don't match pod labels, RBAC rules that are too broad or too narrow, init containers that fail silently.

---

Combine all four layers and you have a chart testing pipeline that catches the full range of errors — from schema violations that prevent installation to subtle template bugs that deploy broken workloads. The investment pays for itself the first time a golden file diff reveals an accidental RBAC change.
