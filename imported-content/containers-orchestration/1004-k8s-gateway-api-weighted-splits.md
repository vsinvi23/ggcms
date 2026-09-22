# Kubernetes Gateway API vs Ingress Controllers: Dynamic Weighted Canary Routing

### The Problem: The Limitations of the Ingress API
For years, the `Ingress` API was the standard for routing external HTTP/S traffic into Kubernetes clusters. However, `Ingress` is notoriously limited. It natively supports only basic host and path-based routing. To implement advanced traffic management—such as canary deployments, header-based routing, or traffic splitting—users had to rely on a messy sprawl of vendor-specific annotations (e.g., `nginx.ingress.kubernetes.io/canary-weight: "10"`). This vendor lock-in defeated the purpose of a standardized API and made migrating between Ingress controllers painful.

### The Solution: The Kubernetes Gateway API
The Gateway API is the official successor to Ingress. It is an expressive, extensible, and role-oriented API that provides native support for advanced routing, including weighted traffic splits for canary deployments, without relying on annotations. It decouples the infrastructure (Gateways) from the application routing logic (HTTPRoutes), enabling platform teams and application developers to operate independently.

### Architecture: Role-Oriented Design

```text
 +---------------------------------------------------+
 | Platform Admin (Manages Infrastructure)           |
 |                                                   |
 |  [ GatewayClass ] -----> [ Gateway ]              |
 |  (e.g., istio, cilium)   (Listens on Port 80/443) |
 +-----------------------------|---------------------+
                               |
 +-----------------------------|---------------------+
 | Application Developer (Manages App Routing)       |
 |                             v                     |
 |                     [ HTTPRoute ]                 |
 |                    /             \                |
 |             Weight: 90%        Weight: 10%        |
 |                 /                   \             |
 |                v                     v            |
 |      [ Service: v1 ]          [ Service: v2 ]     |
 |       (Stable App)             (Canary App)       |
 +---------------------------------------------------+
```

### Implementing a Weighted Canary Split
Suppose we are rolling out a new version of our payments API (`v2`). We want to route exactly 10% of production traffic to `v2` to monitor for error rates, while keeping 90% on the stable `v1`.

First, the platform team provisions a `Gateway`.

```yaml
---
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: api-gateway
  namespace: routing-system
spec:
  gatewayClassName: cilium # Or istio, envoy, etc.
  listeners:
  - name: https
    protocol: HTTPS
    port: 443
    tls:
      mode: Terminate
      certificateRefs:
      - name: api-tls-cert
    allowedRoutes:
      namespaces:
        from: All
```

Next, the application developer creates an `HTTPRoute` that attaches to this Gateway and defines the traffic split.

```yaml
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-route
  namespace: payments
spec:
  parentRefs:
  - name: api-gateway
    namespace: routing-system
  hostnames:
  - "api.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /payments
    backendRefs:
    - name: payments-service-v1
      port: 8080
      weight: 90
    - name: payments-service-v2
      port: 8080
      weight: 10
```

### Advanced Routing: Header-Based Testing
Before opening the 10% canary to live users, you can use the Gateway API to route traffic based on HTTP headers. This allows internal QA teams to test `v2` in production safely.

```yaml
---
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payments-qa-route
  namespace: payments
spec:
  parentRefs:
  - name: api-gateway
    namespace: routing-system
  hostnames:
  - "api.example.com"
  rules:
  - matches:
    - headers:
      - name: X-Test-Group
        value: internal-qa
      path:
        type: PathPrefix
        value: /payments
    backendRefs:
    - name: payments-service-v2
      port: 8080
```
Because the Gateway API processes rules in order of specificity, requests containing the `X-Test-Group: internal-qa` header will hit `v2`, while all other traffic falls back to the weighted split rule (if defined subsequently).

### Operational Considerations
1.  **Gateway Controller**: You must install a controller that implements the Gateway API (e.g., Cilium, Istio, Envoy Gateway, or Contour). The standard NGINX Ingress Controller has a separate implementation for this.
2.  **CRDs**: The Gateway API relies on Custom Resource Definitions (CRDs) which must be installed in the cluster prior to creating `Gateway` or `HTTPRoute` resources.
3.  **Cross-Namespace Routing**: Notice how the `Gateway` in the `routing-system` namespace accepts routes from the `payments` namespace. This is controlled via the `allowedRoutes` field, enforcing explicit security boundaries.

The Gateway API eliminates annotation spaghetti, providing a clean, strongly-typed, and standardized approach to complex traffic shaping in modern Kubernetes deployments.