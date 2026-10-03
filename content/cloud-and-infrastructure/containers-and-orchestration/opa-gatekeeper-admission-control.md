---
title: "OPA Gatekeeper: Enforcing Cluster Policy with Rego and Admission Webhooks"
description: "How OPA Gatekeeper intercepts the Kubernetes API via a validating admission webhook, how ConstraintTemplates and Constraints separate policy logic from policy instantiation, and how to roll out new rules safely with warn/dryrun before enforcing."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "opa-gatekeeper"
  - "admission-webhook"
  - "rego"
  - "policy-as-code"
  - "kubernetes-governance"
---

# OPA Gatekeeper: Enforcing Cluster Policy with Rego and Admission Webhooks

## The Problem: Flexibility Without Guardrails

Kubernetes' API is deliberately permissive — it lets teams define exactly how their workloads run. Without further controls, that flexibility becomes a governance and security liability: developers can deploy pods running as root, pull images from unvetted public registries, omit resource requests/limits entirely, or expose services externally without required annotations. Catching this in code review or CI/CD is not sufficient, because a cluster administrator (or anyone with `kubectl` access and the right RBAC permissions) can always apply a non-compliant manifest directly against the live API, bypassing any pipeline check entirely.

To actually prevent non-compliant objects from ever being persisted, the enforcement point has to live inside the cluster's own admission path — the moment a request is validated, before it's written to `etcd`.

## The Solution: A Validating Admission Webhook

The Open Policy Agent (OPA) Gatekeeper project is a policy engine that plugs into the Kubernetes API server as a **Validating Admission Webhook**. Every write request (create/update) is authenticated and RBAC-authorized as usual, then — before the object reaches `etcd` — the API server calls out to Gatekeeper with the full object payload. Gatekeeper evaluates it against whatever policies are currently loaded and returns an allow/deny decision. A deny means the object is never created; the caller sees a rejection error immediately.

```text
[ User / kubectl ] ---> [ Kubernetes API Server ]
                                |
                        (Authentication & RBAC)
                                |
                       [ Validating Webhook ] ------> [ OPA Gatekeeper ]
                                |                              |
                                |                     (Evaluates Rego policy)
                                |                              |
                                |<----- Allow / Deny ----------|
                                |
                        [ etcd Database ]
```

Think of Gatekeeper as a customs agent stationed between the API server and the database — every object gets inspected before it's allowed to enter.

## Rego, ConstraintTemplates, and Constraints

Gatekeeper's policy language is **Rego**, a declarative logic language purpose-built for this kind of "does this object violate a rule" evaluation. Because Rego is non-trivial to write and you usually want to reuse the same logic across many teams/namespaces with different parameters, Gatekeeper splits policy into two layers:

- **ConstraintTemplate** — the reusable Rego *logic*, plus a schema describing what parameters it accepts. Write once.
- **Constraint** — an *instance* of a template: where it applies (which kinds, which namespaces) and what parameter values to use. Create many, cheaply, per template.

### Defining the Logic: a ConstraintTemplate

This template rejects any pod whose image doesn't start with one of an allowed list of registry prefixes:

```yaml
apiVersion: templates.gatekeeper.sh/v1beta1
kind: ConstraintTemplate
metadata:
  name: k8sallowedrepos
spec:
  crd:
    spec:
      names:
        kind: K8sAllowedRepos
      validation:
        openAPIV3Schema:
          properties:
            repos:
              type: array
              items:
                type: string
  targets:
    - target: admission.k8s.gatekeeper.sh
      rego: |
        package k8sallowedrepos

        violation[{"msg": msg}] {
          container := input.review.object.spec.containers[_]
          satisfied := [good |
            repo := input.parameters.repos[_]
            good := startswith(container.image, repo)
          ]
          not any(satisfied)
          msg := sprintf("Container image %v is from an unauthorized registry.", [container.image])
        }
```

`input.review.object` is the raw incoming Kubernetes object being validated (the admission request payload). The `violation` rule fires — and the request is rejected — whenever none of the container's image prefixes match an entry in `input.parameters.repos`.

### Instantiating It: a Constraint

The `Constraint` object applies the template's logic to a specific set of resource kinds, with concrete parameters:

```yaml
apiVersion: constraints.gatekeeper.sh/v1beta1
kind: K8sAllowedRepos
metadata:
  name: require-corp-registry
spec:
  match:
    kinds:
      - apiGroups: [""]
        kinds: ["Pod"]
    excludedNamespaces: ["kube-system"]
  parameters:
    repos:
      - "registry.corporate.internal/"
```

Any `Pod` object outside `kube-system` whose container images don't start with `registry.corporate.internal/` is now rejected at the API server, cluster-wide, regardless of whether it was created via `kubectl`, a Helm chart, or a CI/CD pipeline.

## Rolling Out Safely: warn and audit Before deny

The riskiest part of introducing a new policy engine is applying it to a cluster that already has running (possibly non-compliant) workloads. Gatekeeper supports staged enforcement via `enforcementAction`:

```yaml
spec:
  enforcementAction: warn
```

With `enforcementAction: warn`, the API server still admits the object, but returns a warning message visible in the `kubectl apply` output. Gatekeeper also continuously **audits** the existing cluster state in the background and records any pre-existing violations in the Constraint object's `status` field — so you can query which already-deployed resources would fail the policy before you ever block anything.

The recommended rollout sequence is: deploy the Constraint with `warn` (or `dryrun`) → review the audit `status` and warnings surfaced to teams over a soak period → have owning teams fix flagged workloads → switch `enforcementAction` to the default (`deny`) once the audit shows zero outstanding violations.

## Key Takeaways

- Gatekeeper enforces policy by acting as a Validating Admission Webhook — it can reject a non-compliant object before it's ever persisted to `etcd`, closing the gap left by CI/CD-only checks.
- `ConstraintTemplate` holds the reusable Rego logic; `Constraint` instantiates that logic against specific kinds/namespaces with concrete parameters — write the Rego once, reuse it everywhere.
- Never go straight to `enforcementAction: deny` on an established cluster — start with `warn`/`dryrun`, use Gatekeeper's continuous audit of existing resources to find violations, fix them, and only then flip to enforcement.
