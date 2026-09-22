# Kubernetes Ingress Explained: Layer 7 Routing and TLS

### The Problem

We know that a `LoadBalancer` Service provides an external IP address to expose our application. However, provisioning a cloud LoadBalancer for every single microservice is an architectural nightmare. 

1. **Cost:** Cloud load balancers are expensive. Provisioning 50 of them for 50 services will rapidly drain your budget.
2. **Routing:** `LoadBalancer` operates at Layer 4 (TCP/UDP). It cannot inspect HTTP traffic to route `/api` to one backend and `/web` to another.
3. **TLS Management:** Managing TLS certificates individually for every Service is complex and error-prone.

We need a way to use a single external IP address, terminate TLS in one place, and route HTTP/HTTPS traffic to different internal Services based on hostnames and URL paths.

### The Solution: Ingress and Ingress Controllers

In Kubernetes, an `Ingress` is an API object that defines rules for routing external HTTP(S) traffic to internal Services. 

An `Ingress Controller` is the actual software component (usually a reverse proxy like NGINX, HAProxy, or Traefik) that runs in the cluster and implements the rules defined by the `Ingress` objects.

```text
       (Internet)
           |
[ Cloud Load Balancer (L4) ]
           |
 [ Ingress Controller (L7) ]
      (e.g., NGINX)
      /           \
  (host: api.x) (host: web.x)
    /               \
[Service A]       [Service B]
```

### Anatomy of an Ingress Resource

An Ingress object allows you to configure Host-based and Path-based routing.

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: main-ingress
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /api
        pathType: Prefix
        backend:
          service:
            name: api-service
            port:
              number: 8080
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-frontend
            port:
              number: 80
```

In this configuration:
- Traffic to `myapp.example.com/api` goes to `api-service` on port `8080`.
- All other traffic to `myapp.example.com` goes to `web-frontend` on port `80`.

### TLS Termination

One of the most critical roles of an Ingress is terminating TLS connections. By terminating TLS at the edge of the cluster, internal services can communicate over unencrypted HTTP, offloading the CPU-intensive encryption/decryption process.

To enable TLS, you must create a Kubernetes Secret containing your certificate and private key, and reference it in the Ingress specification.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: myapp-tls
type: kubernetes.io/tls
data:
  tls.crt: (base64 encoded cert)
  tls.key: (base64 encoded key)
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: tls-ingress
spec:
  tls:
  - hosts:
    - myapp.example.com
    secretName: myapp-tls
  rules:
  - host: myapp.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: web-frontend
            port:
              number: 80
```

### Automation with cert-manager

Managing these TLS secrets manually is tedious. `cert-manager` is a widely adopted Kubernetes add-on that automates the provisioning and renewal of TLS certificates (e.g., via Let's Encrypt).

By adding specific annotations to your Ingress resource, `cert-manager` will automatically negotiate with Let's Encrypt, solve the HTTP-01 or DNS-01 challenge, generate the certificate, and populate the `Secret` referenced in your Ingress.

```yaml
metadata:
  annotations:
    cert-manager.io/cluster-issuer: "letsencrypt-prod"
```

### The Gateway API (The Future)

While Ingress is currently the standard, it suffers from a lack of portability and a heavy reliance on custom annotations (like `nginx.ingress.kubernetes.io/rewrite-target`).

Kubernetes is actively transitioning to the **Gateway API**, a more expressive, extensible, and role-oriented set of APIs (`GatewayClass`, `Gateway`, `HTTPRoute`) designed to supersede Ingress and provide native support for advanced L7 routing, header modification, and traffic splitting out of the box.
