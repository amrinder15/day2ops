---
title: "Kubernetes Operator Patterns That Don't Bite You Later"
description: "Building your first controller is easy. Building one that survives a year of production — without memory leaks, reconciliation storms, or impossible-to-debug state — is what this post is about."
date: 2024-09-10
tags: ["kubernetes", "operators", "golang", "platform"]
heroImage: "/images/k8s-op-best-practice.png"
heroImageAlt: "Kubernetes operator showing best practices for status conditions, finalizers, and reconciliation patterns"
heroImageFit: "contain"
readingTime: 3
author: "Amrinder Rattanpal"
---

When you build your first Kubernetes operator with `operator-sdk`, the sample controller works. The reconciler fires. The status condition updates. You merge the PR feeling like a wizard.

Three months later, the operator is the source of a production incident. Reconciliation CPU is at 400%. The status conditions are correct, but three versions old. The controller log is 80% noise and 20% signal, and you can't tell which is which.

Here are the patterns that separate "works in a demo" from "survives in production."

## 1. Always reconcile idempotently — and prove it

This sounds obvious but it's violated constantly. The Reconciler interface gives you:

```go
func (r *MyReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error)
```

That function will be called:
- On object creation
- On object update (spec OR metadata OR status)
- On any watched object's changes
- Periodically, if you set `RequeueAfter`
- On controller restart (every object)
- When an error occurred previously and the backoff timer fires

Every call must leave the world in a consistent state. The way to prove this: write a test that calls `Reconcile` on the same object five times in a row and asserts the outcome is identical each time.

```go
func TestReconcileIsIdempotent(t *testing.T) {
    // ... setup
    for i := 0; i < 5; i++ {
        result, err := r.Reconcile(ctx, reconcile.Request{
            NamespacedName: types.NamespacedName{
                Name:      "my-object",
                Namespace: "default",
            },
        })
        require.NoError(t, err)
        require.False(t, result.Requeue)
    }
    // Assert final state
    assertConditionTrue(t, obj, "Ready")
}
```

## 2. Status conditions are your API contract

Don't put human-readable strings in `.status.message` and call it done. Use `metav1.Condition` properly:

```go
type MyResourceStatus struct {
    // +listType=map
    // +listMapKey=type
    // +optional
    // +kubebuilder:validation:MaxItems=8
    Conditions []metav1.Condition `json:"conditions,omitempty"`

    // ObservedGeneration lets callers know if this status
    // corresponds to the current spec.
    // +optional
    ObservedGeneration int64 `json:"observedGeneration,omitempty"`
}
```

And in the reconciler, use `apimeta.SetStatusCondition`:

```go
apimeta.SetStatusCondition(&obj.Status.Conditions, metav1.Condition{
    Type:               "Ready",
    Status:             metav1.ConditionTrue,
    ObservedGeneration: obj.Generation,
    Reason:             "ReconcileSucceeded",
    Message:            fmt.Sprintf("All %d children synchronized", childCount),
})

// Always update ObservedGeneration
obj.Status.ObservedGeneration = obj.Generation
```

The `ObservedGeneration` field is critical. Without it, you can't tell whether a status condition reflects the current spec or a previous version.

## 3. Separate your watches — and be specific

The default `For(&MyResource{})` watch is fine, but the `Owns` and `Watches` calls need thought. Every watch that's too broad causes unnecessary reconciliation and can create storms:

```go
// Broad — reconciles on ANY ConfigMap change in the cluster
ctrl.NewControllerManagedBy(mgr).
    For(&myv1.MyResource{}).
    Watches(&corev1.ConfigMap{}, handler.EnqueueRequestsFromMapFunc(...))

// Better — use predicates to filter to relevant objects
ctrl.NewControllerManagedBy(mgr).
    For(&myv1.MyResource{}).
    Watches(
        &corev1.ConfigMap{},
        handler.EnqueueRequestsFromMapFunc(r.configMapToRequests),
        builder.WithPredicates(
            predicate.NewPredicateFuncs(func(obj client.Object) bool {
                // Only watch ConfigMaps with our label
                return obj.GetLabels()["app.kubernetes.io/managed-by"] == "my-operator"
            }),
        ),
    )
```

Also: add a `GenerationChangedPredicate` to the `For` watch so you don't reconcile on pure status updates (which would cause an infinite loop):

```go
ctrl.NewControllerManagedBy(mgr).
    For(&myv1.MyResource{},
        builder.WithPredicates(predicate.GenerationChangedPredicate{}),
    )
```

## 4. Finalizers must be defensive

Finalizer logic is where operators most commonly cause stuck deletions. The rule: **always check if the finalizer should run before running it.**

```go
if obj.DeletionTimestamp.IsZero() {
    // Object not being deleted — ensure finalizer is registered
    if !controllerutil.ContainsFinalizer(obj, myFinalizer) {
        controllerutil.AddFinalizer(obj, myFinalizer)
        if err := r.Update(ctx, obj); err != nil {
            return ctrl.Result{}, err
        }
    }
} else {
    // Object is being deleted
    if controllerutil.ContainsFinalizer(obj, myFinalizer) {
        if err := r.doCleanup(ctx, obj); err != nil {
            // Log but don't return error if cleanup is idempotent and already done
            if !errors.IsNotFound(err) {
                return ctrl.Result{}, err
            }
        }
        controllerutil.RemoveFinalizer(obj, myFinalizer)
        if err := r.Update(ctx, obj); err != nil {
            return ctrl.Result{}, err
        }
    }
    return ctrl.Result{}, nil
}
```

If `doCleanup` can fail permanently, add a timeout and emit a warning condition. Never let a finalizer block deletion indefinitely without surfacing the error.

## 5. Instrument everything

The operator-sdk gives you Prometheus metrics for free (`controller_runtime_reconcile_*`). But you want business-level metrics too:

```go
var (
    childrenManaged = promauto.NewGaugeVec(prometheus.GaugeOpts{
        Name: "myoperator_children_managed_total",
        Help: "Number of child resources currently managed",
    }, []string{"namespace", "resource_type"})

    reconcileDuration = promauto.NewHistogramVec(prometheus.HistogramOpts{
        Name:    "myoperator_reconcile_duration_seconds",
        Help:    "Duration of reconcile loops",
        Buckets: prometheus.DefBuckets,
    }, []string{"resource_name", "outcome"})
)
```

Track per-resource reconcile duration. When a specific resource starts taking 10x longer to reconcile than others, you want to see it before it causes OOM or timeout errors.

---

These patterns came from building and breaking operators across half a dozen clusters. The most expensive lesson: **don't debug controller behavior from logs alone.** Add metrics from day one. Your future 2 AM self will thank you.
