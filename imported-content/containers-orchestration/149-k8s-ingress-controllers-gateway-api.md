# Kubernetes Gateway API vs Ingress Controllers: Routing Modern Traffic

## The Problem: The Fragmented Limitations of Ingress

When Kubernetes Ingress was introduced in Beta in 2015, HTTP traffic routing was relatively straightforward. However, as microservices architectures grew in complexity, the limitations of the classic `Ingress` resource became a major pain point. 

Ingress is structurally simplistic. It defines a basic mapping of hosts and paths to backend services. It lacks native support for modern traffic management patterns such as traffic splitting (canary deployments), header-based routing, redirect rules, or SNI configuration. To support these capabilities, controller vendors (like NGINX, HAProxy, and Traefik) resorted to vendor-specific annotations. This resulted in fragmented, brittle configurations that destroyed portability across environments:

```
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: billing-ingress
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10" # Non-portable!
```

Furthermore, Ingress is a single, monolithic resource. In a production cluster, a single Ingress YAML often mixes infrastructure configuration (TLS certificates, IP allocations) with application routing logic. This forces cluster operators and application developers to edit the same file, violating the principle of least privilege and causing configuration collisions.

---

## The Mental Model: Role-Oriented Declarative Routing

The Kubernetes Gateway API addresses these shortfalls by decoupling routing from infrastructure provision and dividing responsibilities across distinct personas: the Infrastructure Provider, the Cluster Operator, and the Application Developer.

```
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

By separating the API into `GatewayClass`, `Gateway`, and `Route` (e.g., `HTTPRoute`, `TCPRoute`, `GRPCRoute`), the Gateway API ensures:
- **Role-Oriented Access:** Cluster operators manage the lifecycle of the entry point (IPs, certificates) via `Gateway`, while application teams define paths and upstream services via `HTTPRoute`.
- **Expressiveness:** Advanced capabilities like weighted traffic splits, header modification, and mirrors are first-class, fully typed fields rather than custom annotations.
- **Portability:** Configurations are consistent regardless of whether the underlying data plane is Envoy, Istio, NGINX, or a cloud-native load balancer.

---

## Technical Configuration: Advanced Routing in Action

The following configuration demonstrates a Gateway resource managed by an operator, and a corresponding HTTPRoute managed by a developer team, implementing a 90/10 canary traffic split.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: external-web-gateway
  namespace: infra-gateways
spec:
  gatewayClassName: internal-envoy-controller
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - name: production-tls-certs
    allowedRoutes:
      namespaces:
        from: Selector
        selector:
          matchLabels:
            expose-route: "true"
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: billing-route
  namespace: billing-app
  labels:
    expose-route: "true"
spec:
  parentRefs:
  - name: external-web-gateway
    namespace: infra-gateways
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /pay
    backendRefs:
    - name: billing-v1-service
      port: 8080
      weight: 90
    - name: billing-v2-service
      port: 8080
      weight: 10
```

### Deep Dive into the Configuration Mechanism

1. **`gatewayClassName`:** Binds the `Gateway` instance to a controller implementation (e.g., Envoy).
2. **`allowedRoutes`:** Implements a security boundary. The Gateway only permits `HTTPRoute` resources from namespaces labeled with `expose-route: "true"`. This prevents unauthorized namespaces from hijacking ingress paths.
3. **`parentRefs`:** The application route explicitly attaches itself to the infra-gateway, establishing a loose coupling.
4. **`backendRefs` and `weight`:** Defines the canary traffic split natively. The traffic splitting logic is handled entirely by the controller data plane without annotations.

---

## Securing Cross-Namespace References with ReferenceGrant

In standard Ingress, crossing namespace boundaries is either impossible or a major security risk, as any namespace can reference secrets or services in other namespaces. The Gateway API resolves this with the `ReferenceGrant` resource:

```
+------------------------+                     +------------------------+
|  Namespace: infra      |                     |  Namespace: billing    |
|                        |                     |                        |
|  [Gateway]             | ==(Cross-namespace) |  [ReferenceGrant]      |
|  (Tries to bind cert)  | ---- (Blocked by) ->|  (Explicitly permits   |
|                        | <--- (Allowed if) --|   Reference)           |
+------------------------+                     +------------------------+
```

When a Gateway in the `infra` namespace needs to refer to a TLS certificate Secret stored in the `billing` namespace, the target namespace (`billing`) must explicitly declare a `ReferenceGrant` allowing this reference. This ensures that application teams retain strict control over their security assets, preventing unauthorized administrators from hijacking private keys or routing traffic to malicious endpoints across namespace boundaries.

The Gateway API represents a major evolutionary leap. While Ingress remains active for simple, static use cases, modern architectures require the robust multi-tenant control and deep expressiveness provided by the Gateway API.
