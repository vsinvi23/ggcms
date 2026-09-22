# Istio Service Mesh: Zero-Trust mTLS, PeerAuthentication, and Sidecar Proxies

### The Problem: Implicit Trust in Internal Networks
In traditional Kubernetes deployments, once traffic bypasses the external firewall (Ingress), it traverses the internal cluster network in plaintext. If an attacker gains access to a single Pod (via RCE or supply chain compromise), they can passively sniff internal traffic, steal session tokens, or actively forge requests to backend microservices. Internal services implicitly trust requests originating from within the cluster, leaving the network completely defenseless against lateral movement.

### The Solution: Istio Service Mesh and mTLS
A Service Mesh like Istio solves this by decoupling network security from the application code. Istio injects an Envoy proxy "sidecar" into every Pod. These proxies intercept all inbound and outbound traffic. 

Istio uses these sidecars to automatically upgrade plaintext HTTP/TCP traffic to mutual TLS (mTLS). In mTLS, both the client and the server cryptographically authenticate each other using short-lived X.509 certificates issued by Istio's internal Certificate Authority (Istiod). This ensures data in transit is encrypted and cryptographically verifies the identity of the calling workload, enabling true Zero-Trust architecture.

### Architecture: The Sidecar Pattern

```text
      [ Pod A: Frontend ]                      [ Pod B: Backend ]
  +-------------------------+              +-------------------------+
  |    [ App Container ]    |              |    [ App Container ]    |
  | (Sends plaintext HTTP)  |              | (Reads plaintext HTTP)  |
  |           |             |              |             ^           |
  |           v             |              |             |           |
  |  [ Envoy Sidecar ]      |              |  [ Envoy Sidecar ]      |
  +-----------|-------------+              +-------------|-----------+
              |                                          |
              +----------( mTLS Encrypted )--------------+
                   (Validates Spiffe ID over TLS)
```

### Enabling Automatic Sidecar Injection
To deploy Envoy sidecars, you label the namespace. Istio's mutating admission webhook will then automatically inject the proxy into any new Pod created in that namespace.

```bash
kubectl label namespace default istio-injection=enabled
```

When a developer deploys a standard `Deployment`, the resulting Pod will contain two containers: the application and `istio-proxy`. The application continues to make standard HTTP calls to `http://backend-svc:8080`. The local Envoy proxy intercepts this, establishes an mTLS tunnel to the destination Envoy proxy, and forwards the request securely.

### Enforcing Strict mTLS with PeerAuthentication
By default, Istio configures sidecars in `PERMISSIVE` mode. This means a service can accept both encrypted mTLS traffic (from other Istio-injected Pods) and plaintext traffic (from legacy Pods without sidecars). This is useful for migration but fails to enforce Zero-Trust.

To lock down the cluster, we use a `PeerAuthentication` policy to enforce `STRICT` mode.

```yaml
---
apiVersion: security.istio.io/v1beta1
kind: PeerAuthentication
metadata:
  name: default-strict
  namespace: istio-system # Applying in the root namespace affects the whole cluster
spec:
  mtls:
    mode: STRICT
```
Once applied, any attempt to communicate with a meshed workload using plaintext TCP/HTTP will be outright rejected by the receiving Envoy proxy.

### Authorization based on Cryptographic Identity
Encryption is only half the battle; authorization is the other. Because mTLS verifies identity via the SAN (Subject Alternative Name) in the certificate—formatted as a SPIFFE ID (e.g., `spiffe://cluster.local/ns/frontend/sa/frontend-sa`)—we can write strong `AuthorizationPolicies` based on cryptographic proof, not easily spoofed IP addresses.

```yaml
---
apiVersion: security.istio.io/v1beta1
kind: AuthorizationPolicy
metadata:
  name: require-frontend-identity
  namespace: backend
spec:
  selector:
    matchLabels:
      app: backend-api
  action: ALLOW
  rules:
  - from:
    - source:
        # Cryptographically verifies the request comes from the frontend ServiceAccount
        principals: ["cluster.local/ns/frontend/sa/frontend-sa"]
    to:
    - operation:
        methods: ["GET", "POST"]
```

### Operational Considerations
1.  **Liveness/Readiness Probes**: Historically, Kubernetes kubelets (which live outside the mesh) could not perform HTTP health checks on STRICT mTLS pods because the kubelet didn't have a certificate. Istio solves this automatically by rewriting HTTP probes in the Pod spec to route through a dedicated port on the proxy.
2.  **Resource Overhead**: Every Envoy sidecar consumes CPU and memory. In a cluster with thousands of Pods, this overhead is non-trivial. Tuning Envoy concurrency and utilizing Istio's `Sidecar` resource to limit the proxy's routing table scope are mandatory for large-scale performance.
3.  **Ambient Mesh**: Istio is actively developing "Ambient Mesh," a sidecar-less architecture utilizing a node-level zero-trust tunnel (ztunnel) to provide mTLS with significantly less overhead, though sidecars remain the standard for L7 policy enforcement.

Istio's mTLS implementation guarantees that internal network traffic is strongly authenticated and deeply encrypted, protecting against passive eavesdropping and actively blocking unauthorized lateral movement.