# Kubernetes Gateway API vs Ingress Controllers: Dynamic Weighted Canary Routing

## The Problem: The Limitations of Ingress
For years, the `Ingress` resource has been the standard for exposing HTTP/HTTPS routes from outside the cluster to services within. However, the `Ingress` API is fundamentally flawed. It is highly simplistic, defining only hostnames, paths, and TLS termination. 

Because the API lacks advanced traffic management primitives, Ingress Controller implementers (like NGINX, HAProxy, and Traefik) were forced to abuse metadata annotations to support real-world requirements. 

To perform a canary deployment (routing 10% of traffic to a new version) using NGINX Ingress, developers have to rely on brittle, implementation-specific string annotations:
```yaml
metadata:
  annotations:
    nginx.ingress.kubernetes.io/canary: "true"
    nginx.ingress.kubernetes.io/canary-weight: "10"
```
This approach destroys portability. If you migrate from NGINX to AWS ALB, the YAML breaks. Furthermore, `Ingress` combines infrastructure provisioning (the load balancer) and application routing into a single resource, creating RBAC friction between platform teams and developers.

## The Architecture: The Kubernetes Gateway API
The Gateway API is the evolutionary successor to `Ingress`. It is an official, expressive, and extensible standard modeled on Role-Oriented Design. 

It splits networking into three distinct resources:
1. **GatewayClass:** Defines the infrastructure provider (managed by Platform/Cloud teams).
2. **Gateway:** Defines the instantiation of a load balancer and listeners/ports (managed by Platform teams).
3. **HTTPRoute:** Defines the application-level routing logic, matching, and traffic splitting (managed by Application Developers).

```text
[ GatewayClass ] (e.g., istio, cilium, contour)
       |
  [ Gateway ] (Listens on port 80/443 for example.com)
       |
 [ HTTPRoute ] (Path /api/v1, method GET)
   /        \ 
[90%]      [10%]
  v          v
[Svc V1]   [Svc V2]
```

## Implementation: Weighted Canary Splits via Gateway API
With Gateway API, dynamic traffic splitting is a first-class citizen embedded directly into the API schema, requiring zero custom annotations.

### 1. The Gateway Resource
The infrastructure team provisions the Gateway, defining where traffic enters.
```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: external-gw
  namespace: infra
spec:
  gatewayClassName: cilium # or istio, etc.
  listeners:
  - name: http
    protocol: HTTP
    port: 80
```

### 2. The HTTPRoute Resource
The application development team owns the routing rules. To execute a safe canary release, they create an `HTTPRoute` that binds to the `external-gw` and dictates a weight distribution across two `Service` backends.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: HTTPRoute
metadata:
  name: checkout-route
  namespace: e-commerce
spec:
  parentRefs:
  - name: external-gw
    namespace: infra
  hostnames:
  - "checkout.example.com"
  rules:
  - matches:
    - path:
        type: PathPrefix
        value: /api
    backendRefs:
    # 90% of traffic goes to the stable V1 service
    - name: checkout-svc-v1
      port: 8080
      weight: 90
    # 10% of traffic bleeds over to the canary V2 service
    - name: checkout-svc-v2
      port: 8080
      weight: 10
```

### 3. Dynamic Adjustments
To progress the canary release, the developer simply updates the `weight` fields (e.g., 50/50, then 0/100) and applies the YAML. The underlying Gateway controller smoothly shifts traffic according to the standardized spec. 

## Beyond Weighting: Header Matching and Mirroing
Because the API is expressive, developers can easily execute advanced patterns like A/B testing (routing based on HTTP headers) or traffic mirroring (sending a copy of live traffic to a shadowing service for testing without impacting the user response), natively in the `rules` block.

## Conclusion
The Gateway API resolves the structural and organizational failures of Kubernetes `Ingress`. By standardizing advanced traffic primitives like weighted splitting, and decoupling infrastructure provisioning from application routing, it provides a robust, portable, and secure framework for modern CI/CD progressive delivery strategies.
