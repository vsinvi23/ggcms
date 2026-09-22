---
title: "Istio Canary Deployments: Weighted and Header-Based Traffic Splitting"
description: "How Istio's VirtualService and DestinationRule decouple traffic routing from pod replica counts, enabling precise weighted canaries and header-based sticky routing without wasting replicas."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "istio"
  - "canary-deployment"
  - "virtualservice"
  - "destinationrule"
  - "traffic-splitting"
---

# Istio Canary Deployments: Weighted and Header-Based Traffic Splitting

## The Problem: The Inflexibility of Native Kubernetes Rollouts

When deploying updates to high-traffic production environments, deploying in place or using a standard rolling update is a real risk — a bug in the new release can crash the entire system.

To mitigate this, teams use canary deployments: route a small percentage of production traffic (say, 1% or 5%) to the new version (v2) while the rest stays on the stable version (v1).

Attempting this with native Kubernetes Services alone is difficult. A standard Service routes traffic **randomly** across every backend pod matching its selector, weighted only by replica count. To achieve a 1% canary split with plain Kubernetes, you would have to run 99 replicas of v1 and 1 replica of v2. That gives you:

1. **Extreme resource waste** — over-provisioning v1 replicas purely to dilute the routing ratio.
2. **Coarse control** — no ability to split traffic on dynamic parameters like session IDs, HTTP headers, or JWT claims.

## Mental Model: Decoupling Routing from Pod Scaling

Istio solves this by separating routing logic from container replication entirely. Envoy sidecar proxies make the routing decision per-request, in-flight, so replica counts no longer dictate traffic ratios.

```text
       [ Istio Ingress Gateway ]
                    │
                    ▼ (Evaluates VirtualService Rules)
         [ VirtualService: customer-vs ]
              │               │
     (90% Traffic)       (10% Traffic)
              │               │
              v               v
    [ DestinationRule: customer-dr ]
              │               │
      Subset: stable   Subset: canary
              │               │ (Selects labels: version=v2)
              │               │
              v               v
         [ Pods v1 ]     [ Pods v2 ]
```

- **`VirtualService`**: manages traffic *routing* behavior. It parses incoming HTTP requests and assigns them to distinct target subsets based on weights or match conditions.
- **`DestinationRule`**: manages target *configuration*. It defines the "subsets" (e.g., `stable` vs. `canary`) by matching corresponding labels on the underlying Kubernetes Pods.

With Istio, you can run one replica of v2 and one replica of v1, yet still split traffic with exact percentage precision (99%/1%), because the split happens in the Envoy data plane rather than by round-robining across a fixed replica pool.

## Implementation: Staging a 90/10 Canary

The following configures a 90/10 canary split for a microservice named `customer-portal`.

### 1. Defining the Subsets (`destination-rule.yaml`)

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: customer-portal-dr
  namespace: production
spec:
  host: customer-portal-service
  trafficPolicy:
    loadBalancer:
      simple: ROUND_ROBIN
  subsets:
    - name: stable
      labels:
        version: v1.12.0
    - name: canary
      labels:
        version: v2.0.0-rc1
```

### 2. Splitting Traffic in the Mesh (`virtual-service.yaml`)

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: customer-portal-vs
  namespace: production
spec:
  hosts:
    - "customer.serenya.edu"
  gateways:
    - customer-gateway
  http:
    - route:
        - destination:
            host: customer-portal-service
            subset: stable
          weight: 90
        - destination:
            host: customer-portal-service
            subset: canary
          weight: 10
          headers:
            response:
              set:
                x-canary-version: "v2"
```

The `headers.response.set` block stamps every response routed to the canary subset with `x-canary-version: v2`, which is what makes the verification step below possible without needing to inspect pod logs.

## Advanced Scenario: Header-Based Sticky Canary Routing

Beyond weights, you can inject rules that route specific users to the canary based on HTTP cookies or headers — enabling seamless dogfooding for an internal QA team without touching the weighted split seen by real users:

```yaml
  http:
    - match:
        - headers:
            cookie:
              regex: ".*user_type=internal_qa.*"
      route:
        - destination:
            host: customer-portal-service
            subset: canary
    - route:
        - destination:
            host: customer-portal-service
            subset: stable
```

Istio evaluates `http` rules top-to-bottom and stops at the first match — the QA cookie match is checked first and, when present, routes 100% of that request to canary regardless of the weighted rule below it. Any request without the cookie falls through to the unconditional weighted-split rule.

## Verifying Mesh Traffic Routing

Generate traffic against the ingress gateway and capture the response header to verify the actual distribution:

```bash
# Execute curl in a loop to track distribution
for i in {1..100}; do
  curl -s -I http://customer.serenya.edu/index.html | grep "x-canary-version" || echo "stable"
done
```

Across 100 requests, roughly 10 should print the canary header and 90 should print "stable" — confirming the weighted split is being enforced correctly by Envoy, entirely independent of how many pods actually back each subset.

## Rolling the Canary Forward or Back

A canary is only useful if you can promote or abort it quickly. Because the split lives entirely in the `VirtualService` weights, both operations are a single `kubectl apply` with no pod restarts:

```bash
# Promote: shift 100% of traffic to the new version
kubectl patch virtualservice customer-portal-vs -n production --type merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"customer-portal-service","subset":"canary"},"weight":100}]}]}}'

# Abort: instantly roll back to 100% stable
kubectl patch virtualservice customer-portal-vs -n production --type merge -p \
  '{"spec":{"http":[{"route":[{"destination":{"host":"customer-portal-service","subset":"stable"},"weight":100}]}]}}'
```

Because this is a routing-layer change and not a Deployment rollout, the abort path takes effect on the next request — there is no pod termination grace period to wait through.
