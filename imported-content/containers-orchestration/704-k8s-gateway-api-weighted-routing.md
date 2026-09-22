# Migrating to Kubernetes Gateway API: Role-Oriented Infrastructure and Weighted Canary Routing

The Kubernetes `Ingress` resource has been the standard method for exposing web services to the outside world for years. However, as cluster structures scaled, Ingress reached its structural limits. Ingress is a single monolithic resource that combines global infrastructure routing (TLS certificates, load-balancer IPs) with application-specific configuration. This forces cluster operators and application developers to modify the same resource, leading to namespace collisions, configuration drift, and vendor-specific annotations that make configuration fragile and non-portable.

The Kubernetes Gateway API solves this through a split, role-oriented resource hierarchy that enforces separation of concerns.

---

## Monolithic Ingress vs Split Gateway API

Traditional Ingress requires a single resource to define everything, creating a bottleneck for different teams:

```
[ Ingress Manifest ] (Shared by Operator and Application Developer)
         │
         ▼
[ Ingress Controller ] ──► [ Pod v1 (Port 80) ] & [ Pod v2 (Port 80) ]
```

The Gateway API decouples these responsibilities into distinct, targeted resources:

```
   ┌────────────────────────────────────────────────────────┐
   │ Infrastructure Provider (GatewayClass - Global Config) │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │ Cluster Operator (Gateway - TLS Certs, Ports, Host)     │
   └───────────────────────────┬────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────┐
   │ Application Developer (HTTPRoute - Path Routing, Canary)│
   └───────────────────────────┬────────────────────────────┘
                               ├──────────────────────┐
                               ▼ (90% Weight)         ▼ (10% Weight)
                        ┌──────────────┐       ┌──────────────┐
                        │ App Service  │       │ App Service  │
                        │   (v1 Pods)  │       │   (v2 Pods)  │
                        └──────────────┘       └──────────────┘
```

This ensures that Application Developers do not need cluster-admin access to update routing paths, while Cluster Operators maintain control over external VIPs and SSL certs.

---

## Production Gateway API Configuration

The following manifests show a production-grade implementation of the Gateway API. This configuration deploys a central `Gateway` and an `HTTPRoute` that performs a weighted 90/10 canary traffic split between a stable application version and a canary version.

### 1. The Gateway Resource (Operator Managed)
This resource provisions the cloud load balancer, configures ports, and binds the TLS certificates.

```yaml
apiVersion: gateway.networking.k8s.io/v1
kind: Gateway
metadata:
  name: external-gateway
  namespace: infra-ingress
spec:
  gatewayClassName: internal-gclb # Standard controller implementation reference
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

*Note: The `allowedRoutes` directive allows namespaces labeled with `ingress-allowed: "true"` to attach their routing definitions to this Gateway. This provides absolute boundaries against rogue namespace attachments.*

### 2. The HTTPRoute Resource with Canary split (Developer Managed)
This resource is deployed in the application's namespace. It defines path matching and native traffic splitting without any custom annotations.

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

---

## Technical Superiority over Ingress

### 1. Native Traffic Splitting
Under traditional Ingress, achieving a 90/10 split requires vendor-specific service mesh integration or arbitrary ingress controller annotations (e.g., `nginx.ingress.kubernetes.io/canary-weight`). Gateway API standardizes this with the native `weight` field on `backendRefs`.

### 2. Multi-Namespace Routing
Gateway API allows an `HTTPRoute` in the `business-apps` namespace to reference a `Gateway` in the `infra-ingress` namespace. This prevents developers from touching infrastructure configurations, preserving the integrity of the cluster gateway.

### 3. Header-based Routing Matches
Gateway API supports routing based on headers, query parameters, or HTTP methods natively:

```yaml
matches:
- headers:
  - name: x-developer-tier
    value: internal
  path:
    type: PathPrefix
    value: /api/v1
```

Migrating to the Gateway API modernizes traffic routing by replacing brittle ingress systems with a clean, extensible, and secure application architecture.
