# Kubernetes Gateway API vs Ingress Controllers: Dynamic Weighted Canary Routing

### The Problem: The Limitations of Ingress

The Kubernetes `Ingress` API has historically been the standard for routing external HTTP/HTTPS traffic to internal services. However, the `Ingress` specification is highly constrained; it primarily supports basic host and path-based routing. To implement advanced traffic management—such as weighted traffic splitting for canary deployments, header-based routing, or protocol-specific configuration (gRPC, TCP)—administrators are forced to rely on proprietary, vendor-specific annotations (e.g., `nginx.ingress.kubernetes.io/canary-weight`). This results in configuration fragmentation and vendor lock-in.

### The Solution: Kubernetes Gateway API

The Gateway API is the evolutionary successor to `Ingress`. It provides an extensible, role-oriented, standard API for modeling service networking in Kubernetes. It separates the infrastructure provisioning (`GatewayClass`, `Gateway`) from the routing configuration (`HTTPRoute`, `TLSRoute`, `GRPCRoute`), allowing infrastructure operators and application developers to work independently without stepping on each other's configurations.

### Architecture: Role-Oriented Design

The Gateway API introduces a hierarchy managed by different personas:

```text
+---------------------+
|    GatewayClass     |  <--- Provided by Platform Vendor (e.g., Istio, Envoy, GKE)
| (Defines controller)|       Defines the underlying load balancer technology.
+---------+-----------+
          |
+---------v-----------+
|       Gateway       |  <--- Managed by Cluster Operator (Infra Admin)
|  (Instantiates LB,  |       Defines listeners (ports, TLS certs, protocols).
|   Binds to IPs)     |
+---------+-----------+
          |
+---------v-----------+
|      HTTPRoute      |  <--- Managed by Application Developer
| (Defines routing    |       Defines hostnames, paths, headers, and traffic weights.
|  logic & splits)    |
+---------+-----------+
          |
+---------v-----------+
|      Service        |  <--- Kubernetes Services (The targets)
+---------------------+
```

### Implementation: Weighted Canary Deployment

Let's implement a scenario where a new version of an application (v2) is deployed, and we want to route exactly 10% of the traffic to it, keeping 90% on the stable version (v1).

#### 1. Defining the Gateway (Operator Role)

The infrastructure team creates a `Gateway` listening on port 80 for HTTP traffic.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: external-http-gateway
  namespace: infra-routing
spec:
  gatewayClassName: istio # Or envoy, cilium, etc.
  listeners:
  - name: http
    protocol: HTTP
    port: 80
    allowedRoutes:
      namespaces:
        from: All # Allow developers in any namespace to attach routes
```

#### 2. Defining the Services (Developer Role)

The application team deploys two services, representing the two versions of their application.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: app-v1
  namespace: app-team-a
spec:
  selector:
    app: myapp
    version: v1
  ports:
  - port: 8080
---
apiVersion: v1
kind: Service
metadata:
  name: app-v2
  namespace: app-team-a
spec:
  selector:
    app: myapp
    version: v2
  ports:
  - port: 8080
```

#### 3. Configuring the HTTPRoute for Traffic Splitting (Developer Role)

The application team creates an `HTTPRoute` that attaches to the shared `Gateway`. They define rules to distribute traffic based on explicit `weight` parameters.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: myapp-canary-route
  namespace: app-team-a
spec:
  parentRefs:
  - name: external-http-gateway
    namespace: infra-routing
  hostnames:
  - "api.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /v1/data
    backendRefs:
    - name: app-v1
      port: 8080
      weight: 90
    - name: app-v2
      port: 8080
      weight: 10
```

Because this logic is defined in the standard API spec, you can switch from an Nginx-based Gateway to an Envoy-based Gateway by simply changing the `GatewayClass`, without altering a single line of your application's `HTTPRoute` YAML.

### Operational Considerations

*   **CRD Requirement:** The Gateway API is not installed by default in older clusters. You must install the standard Custom Resource Definitions (CRDs) and deploy a Gateway API-compliant controller.
*   **Advanced Routing:** Beyond weighting, `HTTPRoute` supports native header matching (e.g., routing traffic to v2 only if the header `X-Debug: true` is present) and request/response header modification, completely replacing complex Ingress snippets.
*   **Cross-Namespace Routing:** Note that `backendRefs` can only point to services in the same namespace by default. If cross-namespace routing is required, a `ReferenceGrant` resource must be explicitly created by the target namespace owner to permit the connection, ensuring security boundary enforcement.
