---
title: "Writing Your First Kubernetes Operator: Beyond the Hello World"
description: "The operator-sdk scaffolding is easy. The reconcile loop that actually handles real-world edge cases — retries, finalizers, status conditions — is where the learning happens."
date: 2024-09-21
tags: ["kubernetes", "operators", "golang", "controller-runtime", "platform"]
heroImage: "/images/k8s-op-beyond.png"
heroImageAlt: "Kubernetes operator dashboard with status conditions and finalizers"
heroImageFit: "contain"
readingTime: 3
author: "Amrinder Rattanpal"
---

Every Kubernetes operator tutorial ends at the same place: "and now your controller is reconciling!" They show you a green log line and call it done.

They don't show you what happens when your external API is flaky. Or when a user deletes the resource mid-reconcile. Or how to surface meaningful status to the teams using your operator.

This post picks up where those tutorials leave off.

## The Reconcile Contract

The `Reconciler` interface is deceptively simple:

```go
type Reconciler interface {
    Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error)
}
```

Two return values. But the semantics are nuanced:

| Return | Meaning |
|---|---|
| `ctrl.Result{}, nil` | Done. No requeue. |
| `ctrl.Result{RequeueAfter: 30s}, nil` | Requeue in 30s. Not an error. |
| `ctrl.Result{}, err` | Error — requeue with exponential backoff. |
| `ctrl.Result{Requeue: true}, nil` | Immediate requeue. Use sparingly. |

The most common mistake: returning `err` for transient conditions (API timeouts, rate limits) and `nil` for persistent errors (bad spec, missing dependencies). Get this backwards and you'll have spammy logs or silent failures.

## Status Conditions Done Right

The `metav1.Condition` type is the idiomatic way to express complex resource state. Don't invent your own:

```go
import "k8s.io/apimachinery/pkg/api/meta"

func (r *MyResourceReconciler) updateStatus(
    ctx context.Context,
    obj *myv1.MyResource,
    condType string,
    status metav1.ConditionStatus,
    reason, message string,
) error {
    condition := metav1.Condition{
        Type:               condType,
        Status:             status,
        Reason:             reason,
        Message:            message,
        ObservedGeneration: obj.Generation,
    }

    meta.SetStatusCondition(&obj.Status.Conditions, condition)

    // Use the status subresource — don't update the full object
    return r.Status().Update(ctx, obj)
}
```

`ObservedGeneration` is easy to miss but critical. It tells observers whether the status reflects the _current_ spec or a previous version. Always set it.

Your conditions should read like sentences:

```
Type:    Ready
Status:  False
Reason:  ExternalAPIUnavailable
Message: "Cannot reach provisioning API: connection refused (attempt 3/5)"
```

Not like this:

```
Type:    Ready
Status:  False
Reason:  Error
Message: "err: dial tcp: connect: connection refused"
```

Raw error strings in `Message` are for debugging — not for the humans reading `kubectl describe`.

## Finalizers: The Deletion Trap

Finalizers let you run cleanup logic before a resource is deleted. They're also how you create objects that become impossible to delete.

The pattern:

```go
const myFinalizer = "myresource.example.com/cleanup"

func (r *Reconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {
    var obj myv1.MyResource
    if err := r.Get(ctx, req.NamespacedName, &obj); err != nil {
        return ctrl.Result{}, client.IgnoreNotFound(err)
    }

    // Handle deletion
    if !obj.DeletionTimestamp.IsZero() {
        if controllerutil.ContainsFinalizer(&obj, myFinalizer) {
            // Do your cleanup
            if err := r.cleanup(ctx, &obj); err != nil {
                return ctrl.Result{}, err
            }
            // Remove finalizer — deletion will proceed
            controllerutil.RemoveFinalizer(&obj, myFinalizer)
            return ctrl.Result{}, r.Update(ctx, &obj)
        }
        return ctrl.Result{}, nil
    }

    // Add finalizer on first reconcile
    if !controllerutil.ContainsFinalizer(&obj, myFinalizer) {
        controllerutil.AddFinalizer(&obj, myFinalizer)
        return ctrl.Result{}, r.Update(ctx, &obj)
    }

    // Normal reconcile logic...
    return r.reconcileNormal(ctx, &obj)
}
```

**The trap**: if `r.cleanup()` always returns an error, the finalizer is never removed and the object can never be deleted. Add a timeout or max-retry mechanism to your cleanup logic.

```go
func (r *Reconciler) cleanup(ctx context.Context, obj *myv1.MyResource) error {
    // Check if cleanup already happened (idempotent)
    if obj.Status.CleanupComplete {
        return nil
    }

    // Add a deadline independent of the reconcile context
    cleanupCtx, cancel := context.WithTimeout(ctx, 30*time.Second)
    defer cancel()

    if err := r.externalAPI.Delete(cleanupCtx, obj.Status.ExternalID); err != nil {
        // Distinguish: is this retryable or permanent?
        if isNotFound(err) {
            // Already gone — that's fine
            return nil
        }
        return fmt.Errorf("cleanup failed: %w", err)
    }

    return nil
}
```

## Watch Predicates: Stop Reconciling Noise

By default, your controller reconciles on every update to the watched resource — including status updates _that your controller just wrote_. This creates tight reconcile loops.

Use predicates:

```go
ctrl.NewControllerManagedBy(mgr).
    For(&myv1.MyResource{},
        builder.WithPredicates(predicate.GenerationChangedPredicate{}),
    ).
    Owns(&appsv1.Deployment{}).
    Complete(r)
```

`GenerationChangedPredicate` ignores spec-unchanged updates. This single line often cuts reconcile volume by 60–80% in busy clusters.

For owned resources, the `Owns()` relationship sets up a watch that automatically enqueues the parent on child changes — no manual `EnqueueRequestForOwner` needed.

## One Pattern to Internalize

The "desired state vs actual state" mindset is the heart of every reconciler. Write it explicitly:

```go
func (r *Reconciler) reconcileNormal(ctx context.Context, obj *myv1.MyResource) (ctrl.Result, error) {
    // 1. Compute desired state from spec
    desired := r.buildDesiredDeployment(obj)

    // 2. Get actual state
    actual := &appsv1.Deployment{}
    err := r.Get(ctx, client.ObjectKeyFromObject(desired), actual)

    if client.IgnoreNotFound(err) != nil {
        return ctrl.Result{}, err
    }

    // 3. Reconcile: create or update
    if apierrors.IsNotFound(err) {
        if err := r.Create(ctx, desired); err != nil {
            return ctrl.Result{}, err
        }
        return ctrl.Result{RequeueAfter: 5 * time.Second}, nil
    }

    // Patch (not update) to avoid resource version conflicts
    patch := client.MergeFrom(actual.DeepCopy())
    actual.Spec = desired.Spec
    if err := r.Patch(ctx, actual, patch); err != nil {
        return ctrl.Result{}, err
    }

    return ctrl.Result{}, nil
}
```

Always patch, never update full objects in the reconcile path. Patches are conflict-safe. Full updates will fail with `409 Conflict` under concurrent reconciles.

---

The path from "it works in my local cluster" to "it runs reliably in production" is mostly about understanding these edge cases. The scaffolding generates the skeleton — the thinking above is what fills it in.
