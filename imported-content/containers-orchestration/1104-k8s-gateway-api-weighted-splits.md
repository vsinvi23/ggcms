# Kubernetes Gateway API vs Ingress Controllers: Dynamic Weighted Canary Routing

The legacy Kubernetes `Ingress` resource has been the standard for managing external HTTP traffic into clusters for years. However, its simplicity has become its weakness. Modern traffic patterns—such as blue-green deployments, rate limiting, header manipulation, and weighted canary routing—cannot be natively represented in Ingress. 

To bypass these limitations, ingress controller vendors introduced a convoluted web of proprietary annotations (e.g., `nginx.ingress.kubernetes.io/canary-weight`). This created vendor lock-in, unportable YAML configurations, and fragile operational setups.

The **Kubernetes Gateway API** solves this by offering a highly expressive, role-oriented, and extensible standard. In this article, we demonstrate how to leverage Gateway API to configure dynamic weighted canary traffic splits without proprietary annotations.

---

## Technical Architecture: Role Separation and Canary Splits

Unlike Ingress, which combines routing rules, TLS configuration, and host matching into a single bloated resource, the Gateway API splits these responsibilities across separate resources matching organizational roles:

1. **GatewayClass** (Infrastructure Provider): Defines the controller implementation (e.g., Istio, Envoy, GKE).
2. **Gateway** (Cluster Operator): Manages the entry point, IP address allocation, and TLS certificates.
3. **HTTPRoute** (Application Developer): Manages routing, header manipulation, and backend traffic weights.

```text
               +--------------------------------------+
               |    GatewayClass (Cloud/Infra Provider|
               +------------------+-------------------+
                                  |
                                  v
               +--------------------------------------+
               |      Gateway (Cluster Operator)      |  (TLS and IP details)
               +------------------+-------------------+
                                  |
               +------------------+------------------+
               |                                     |
               v (HTTPRoute ParentRef)               v
+-----------------------------+       +-----------------------------+
|    App Developer:           |       |    App Developer:           |
|    HTTPRoute (app-a-route)  |       |    HTTPRoute (app-b-route)  |
+--------------+--------------+       +--------------+--------------+
               |                                     |
      +--------+--------+                            v
      | (90% Weight)    | (10% Weight)           Service B
      v                 v
  Service A         Service A-Canary
  (v1.0.0)          (v1.1.0-canary)
```

---

## Defining the Gateway Infrastructure (Cluster Operator Role)

First, we provision a `Gateway` that listens on port 80 (HTTP) for incoming traffic matching hostnames on our domain.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: external-gateway
  namespace: infrastructure
spec:
  gatewayClassName: envoy-gateway # Specifies the underlaying GatewayClass
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All  # Allows HTTPRoutes from any namespace to attach to this Gateway
```

---

## Implementing Weighted Canary Routing (Developer Role)

Now, as an application developer, we deploy the `HTTPRoute` in our own namespace (`production`). We will route traffic for `api.example.com` such that **90% of requests** hit our stable `v1` service, and **10% of requests** hit the canary `v1.1` service.

This entire split is described using native, portable Kubernetes specifications:

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payment-api-route
  namespace: production
spec:
  parentRefs:
  - name: external-gateway
    namespace: infrastructure
  hostnames:
  - "api.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /v1/payments
    backendRefs:
    # 90% Traffic to Stable Service
    - name: payment-service-stable
      port: 8080
      weight: 90
    # 10% Traffic to Canary Service
    - name: payment-service-canary
      port: 8080
      weight: 10
```

---

## Comparison: Ingress vs. Gateway API

| Feature | Legacy Ingress | Gateway API (Native) |
| :--- | :--- | :--- |
| **API Status** | GA (Legacy Maintenance) | GA (Standard for modern clusters) |
| **Role Separation** | None (Single YAML file for all configs) | Explicit (GatewayClass, Gateway, HTTPRoute) |
| **Multi-Backend Split** | Non-standard annotations | Supported natively (`backendRefs` + `weight`) |
| **Header-based routing**| Vendor annotations only | Supported natively (`matches: - headers:`) |
| **Multiple Protocols** | Limited (mostly HTTP/S) | Extensive (HTTP, HTTPS, gRPC, TCP, UDP) |
| **Portability** | Low (Annotations cause vendor lock) | High (Standardized across Envoy, Linkerd, Istio, Cloud Load Balancers) |

---

## Advanced Routing: Header-Based Canary Overrides

For internal QA testing, we want to force routing to the canary backend when a specific HTTP header is present (e.g., `X-Canary-Test: true`), regardless of the general weight splits.

Gateway API allows us to declare precedence easily. Rules in an `HTTPRoute` are evaluated sequentially, from top to bottom.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: payment-api-route-override
  namespace: production
spec:
  parentRefs:
  - name: external-gateway
    namespace: infrastructure
  hostnames:
  - "api.example.com"
  rules:
  # Rule 1: Match Specific QA Header (Evaluated First)
  - matches:
    - headers:
      - name: X-Canary-Test
        value: "true"
      path:
        type: PathPrefix
        value: /v1/payments
    backendRefs:
    - name: payment-service-canary
      port: 8080
      weight: 100 # Force 100% of these test requests to the canary
  # Rule 2: General Weighted Split (Evaluated Second)
  - matches:
    - path:
        type: PathPrefix
        value: /v1/payments
    backendRefs:
    - name: payment-service-stable
      port: 8080
      weight: 90
    - name: payment-service-canary
      port: 8080
      weight: 10
```

By transitioning to the Gateway API, you move beyond the brittle design of legacy Ingress annotations and adopt a standardized, flexible, and robust traffic routing layer designed for modern microservice architectures.
