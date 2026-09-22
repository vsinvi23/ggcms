# Kubernetes Network Policies: Hardening Pod-to-Pod Traffic and Default-Deny

### The Problem: Flat Networks in Kubernetes
By default, Kubernetes clusters exhibit a flat network topology. Any Pod can communicate with any other Pod in the cluster without restriction. This "open-by-default" stance is excellent for getting started but represents a massive security risk in production. A compromised frontend web server can freely probe and exploit a backend database or internal caching layer, allowing lateral movement to happen unabated.

### The Solution: Network Policies and Zero-Trust
Kubernetes `NetworkPolicy` resources act as an application-centric firewall. Implemented by the Container Network Interface (CNI) plugin (such as Calico, Cilium, or Weave), NetworkPolicies restrict ingress and egress traffic at the IP address or port level (OSI layer 3/4). By adopting a default-deny posture and explicitly whitelisting allowed communication paths, we restrict lateral movement and enforce a zero-trust model between tiers.

### Architecture: Multi-Tier Isolation

```text
       [ External Traffic ]
                |
                v
  +---------------------------+
  |    Ingress Controller     | Namespace: ingress-nginx
  +---------------------------+
                |
          (Allows Port 80/443)
                v
  +---------------------------+
  |       Web Tier Pods       | Namespace: web
  |   (React / NGINX / Go)    |
  +---------------------------+
                |
          (Allows Port 8080)
                v
  +---------------------------+
  |      App Tier Pods        | Namespace: api
  |   (Spring / Node / Py)    |
  +---------------------------+
                |
          (Allows Port 5432)
                v
  +---------------------------+
  |      Data Tier Pods       | Namespace: db
  |  (PostgreSQL / Redis)     |
  +---------------------------+
```

### Implementing a Default-Deny Posture
The first step in securing a namespace is to drop all ingress and egress traffic by default. This forces developers to declare their required dependencies explicitly. 

```yaml
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: api
spec:
  podSelector: {} # Selects all Pods in the namespace
  policyTypes:
  - Ingress
  - Egress
```
With this policy applied in the `api` namespace, Pods cannot receive incoming requests, nor can they establish outward connections, including resolving DNS.

### Whitelisting Egress (DNS)
Before an application can reach an external service or a database, it must resolve its hostname. You must explicitly permit egress traffic to CoreDNS.

```yaml
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: api
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

### Enabling Multi-Tier Communication
To allow the `api` tier to receive traffic *only* from the `web` tier, we define an Ingress rule utilizing `namespaceSelector` and `podSelector`.

```yaml
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow-web-ingress
  namespace: api
spec:
  podSelector:
    matchLabels:
      app: backend-api
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: web
      podSelector:
        matchLabels:
          app: frontend-web
    ports:
    - protocol: TCP
      port: 8080
```
Next, we authorize the `api` tier to communicate with the `db` tier.

```yaml
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: api-allow-db-egress
  namespace: api
spec:
  podSelector:
    matchLabels:
      app: backend-api
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: db
      podSelector:
        matchLabels:
          app: postgres
    ports:
    - protocol: TCP
      port: 5432
```

### Operational Considerations
1.  **CNI Support**: Ensure your cluster operates a CNI plugin that supports `NetworkPolicy`. Flannel, Calico, and Cilium are common choices. Native AWS VPC CNI supports policies in newer versions.
2.  **Namespace Labels**: In Kubernetes 1.21+, namespaces are automatically labeled with `kubernetes.io/metadata.name`. This significantly simplifies `namespaceSelector` usage compared to manually applying custom labels to every namespace.
3.  **Audit and Dry-Run**: Standard Kubernetes NetworkPolicies lack a "dry-run" or logging mode natively. Consider using CNI-specific extensions (e.g., CiliumNetworkPolicy, Calico GlobalNetworkPolicy) which provide packet logging to audit traffic before enforcing hard blocks.

Applying default-deny policies fundamentally shifts the operational posture from implicit trust to explicit authorization, shrinking the blast radius of any container compromise.