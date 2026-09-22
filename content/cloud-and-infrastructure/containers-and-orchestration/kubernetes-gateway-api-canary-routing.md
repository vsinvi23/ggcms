---
title: "Kubernetes Gateway API: Role-Oriented Routing and Weighted Canary Splits"
description: "How the Gateway API replaces vendor-specific Ingress annotations with a role-oriented, portable resource hierarchy for TLS termination, weighted traffic splits, header routing, and cross-namespace ReferenceGrants."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "gateway-api"
  - "ingress"
  - "httproute"
  - "canary-deployment"
  - "referencegrant"
---

# Kubernetes Gateway API: Role-Oriented Routing and Weighted Canary Splits

## The Problem: The Fragmented Limitations of Ingress

When Kubernetes `Ingress` was introduced, HTTP traffic routing was relatively straightforward — a basic mapping of hosts and paths to backend Services. But as microservice architectures grew, the limitations of the classic `Ingress` resource became a real pain point: it has no native support for traffic splitting (canary deployments), header-based routing, or protocol-specific configuration (gRPC, TCP).

To work around this, controller vendors (NGINX, HAProxy, Traefik) resorted to proprietary annotations:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: billing-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10" # Non-portable!
```

This results in fragmented, brittle configurations that break the moment you switch ingress controllers. Worse, `Ingress` is a single monolithic resource — a production Ingress manifest often mixes infrastructure configuration (TLS certificates, IP allocation) with application routing logic, forcing cluster operators and application developers to edit the same file and collide with each other's changes.

## The Mental Model: Role-Oriented Declarative Routing

The Gateway API is the evolutionary successor to `Ingress`. It splits routing into distinct resources, each owned by a different persona:

```text
+-------------------------------------------------------+
|  Infrastructure Provider (GatewayClass: GKE/Envoy)    |
+-------------------------------------------------------+
                           |
                           v (Instantiates)
+-------------------------------------------------------+
|  Cluster Operator (Gateway: Port 443, TLS Secret)     |
+-------------------------------------------------------+
                           |
                           v (Attaches routes to)
+-------------------------------------------------------+
|  Application Developer (HTTPRoute: Paths, Weights)   |
+-------------------------------------------------------+
```

- **`GatewayClass`**: provided by the infrastructure vendor (Istio, Envoy, a cloud provider's load balancer). Defines which controller implementation backs the Gateway.
- **`Gateway`**: managed by the cluster operator. Instantiates the actual load balancer — listeners, ports, TLS certificates, and which namespaces are allowed to attach routes.
- **`HTTPRoute`** (and `TCPRoute`/`GRPCRoute`): managed by application developers. Defines hostnames, paths, header matches, and traffic weights — with no cluster-admin privileges required.

This gives three concrete wins over `Ingress`:

- **Role-oriented access**: operators own the entry point (IPs, certs); application teams own routing logic — without either needing write access to the other's resource.
- **Expressiveness**: weighted splits, header matching, and request mirroring are typed, first-class fields instead of controller-specific annotations.
- **Portability**: the same `HTTPRoute` YAML works whether the underlying data plane is Envoy, Istio, NGINX, or a cloud-native load balancer — only `gatewayClassName` changes.

## Implementation: A Weighted Canary Split

### 1. The Gateway Resource (Operator-Managed)

Provisions the load balancer, terminates TLS, and restricts which namespaces may attach routes:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: external-gateway
  namespace: infra-ingress
spec:
  gatewayClassName: internal-gclb
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - group: ""
        kind: Secret
        name: wildcard-api-tls
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            ingress-allowed: "true"
```

`allowedRoutes` is an explicit security boundary: only namespaces labeled `ingress-allowed: "true"` may attach an `HTTPRoute` to this Gateway, preventing a rogue namespace from hijacking traffic that was never meant for it.

### 2. The Services (Developer-Managed)

Two Services representing the stable and canary versions of the application:

```yaml
apiVersion: v1
kind: Service
metadata:
  name: billing-service-v1
  namespace: business-apps
spec:
  selector:
    app: billing
    version: v1
  ports:
  - port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: billing-service-v2
  namespace: business-apps
spec:
  selector:
    app: billing
    version: v2
  ports:
  - port: 8080
```

### 3. The HTTPRoute with a Weighted Canary Split (Developer-Managed)

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: billing-service-route
  namespace: business-apps
spec:
  parentRefs:
  - group: gateway.networking.k8s.io
    kind: Gateway
    name: external-gateway
    namespace: infra-ingress
  hostnames:
  - "billing.company.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api/v1/checkout
    backendRefs:
    - name: billing-service-v1
      port: 8080
      weight: 90
    - name: billing-service-v2 # Canary deployment
      port: 8080
      weight: 10
```

Because `backendRefs[].weight` is a native, typed field, this 90/10 split is portable across any Gateway API-compliant controller — no `nginx.ingress.kubernetes.io/canary-weight`-style annotation to rewrite when you change controllers.

### 4. Header-Based Routing (No Annotations Required)

The Gateway API also supports routing on headers, query parameters, or HTTP methods natively — useful for routing internal QA traffic to the canary independent of the weighted split:

```yaml
  rules:
  - matches:
    - headers:
      - name: x-developer-tier
        value: internal
      path:
        type: PathPrefix
        value: /api/v1
    backendRefs:
    - name: billing-service-v2
      port: 8080
```

## Securing Cross-Namespace References with ReferenceGrant

Under classic `Ingress`, crossing namespace boundaries to reference a Secret or Service in another namespace is either impossible or a security risk, since any namespace could reference resources it doesn't own. The Gateway API closes this with `ReferenceGrant`:

```text
+------------------------+                     +------------------------+
|  Namespace: infra      |                     |  Namespace: billing    |
|                        |                     |                        |
|  [Gateway]             | ==(Cross-namespace) |  [ReferenceGrant]      |
|  (Tries to bind cert)  | ---- (Blocked by) ->|  (Explicitly permits   |
|                        | <--- (Allowed if) --|   Reference)           |
+------------------------+                     +------------------------+
```

If a `Gateway` in the `infra` namespace needs a TLS certificate Secret stored in the `billing` namespace, the `billing` namespace owners must explicitly create a `ReferenceGrant` permitting that reference:

```yaml
apiVersion: gateway.networking.k8s.io/v1beta1
kind: ReferenceGrant
metadata:
  name: allow-infra-gateway-cert-access
  namespace: billing
spec:
  from:
  - group: gateway.networking.k8s.io
    kind: Gateway
    namespace: infra
  to:
  - group: ""
    kind: Secret
```

This ensures the `billing` team retains control over which external resources may reference its Secrets and Services — the reference is opt-in from the target's side, not something the source namespace can unilaterally force.

## Operational Considerations

- **CRD requirement**: the Gateway API is not installed by default on most clusters. You must install its CRDs and deploy a Gateway API-compliant controller (Istio, Envoy Gateway, or a cloud provider's implementation) before any of the above resources take effect.
- **Same-namespace default for `backendRefs`**: `backendRefs` can only point to Services in the same namespace as the `HTTPRoute` by default. Cross-namespace `backendRefs` also require a `ReferenceGrant` in the target namespace.
- **No forced migration**: `Ingress` remains functional for simple, static routing needs — the Gateway API is worth adopting specifically once you need multi-tenant routing, weighted splits, or header-based rules that would otherwise require vendor annotations.

## Conclusion

The Gateway API replaces `Ingress`'s single monolithic resource and vendor-annotation sprawl with a role-oriented hierarchy — `GatewayClass`, `Gateway`, `HTTPRoute` — where weighted canary splits and header routing are standard, typed fields rather than controller-specific hacks, and `ReferenceGrant` gives namespace owners explicit, opt-in control over cross-namespace references.
