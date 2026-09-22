# Kubernetes Network Policies: Hardening Pod-to-Pod Traffic and Default-Deny

### The Problem: A Flat, Open Network

By default, Kubernetes clusters operate on a flat network model. Any pod can communicate with any other pod across any namespace. While this simplifies initial deployment and connectivity, it introduces a severe security vulnerability. If an attacker compromises a single public-facing pod, they gain unfettered lateral movement capabilities to probe, access, and exploit internal microservices, databases, and message queues.

### The Solution: Zero-Trust via Network Policies

Kubernetes NetworkPolicies provide the mechanism to enforce a zero-trust network model at the pod level. By implementing a "default-deny" stance and explicitly whitelisting required traffic paths, you restrict lateral movement and segment the cluster into secure tiers.

### Architecture: Multi-Tier Isolation

Consider a standard three-tier architecture:
1.  **Frontend (Web):** Exposed to external ingress.
2.  **Backend (App):** Processes business logic.
3.  **Database (DB):** Persists data.

The goal is to ensure the Web tier can only talk to the App tier, and the App tier can only talk to the DB tier. The DB tier must never be accessible directly from the Web tier or external sources.

```text
+----------------+      +----------------+      +---------------+
|    Internet    |      |                |      |               |
|  (Ingress NS)  +------>  Frontend Pods +------> Backend Pods  |
|                |      |  (Web Tier)    |      |  (App Tier)   |
+----------------+      +----------------+      +-------+-------+
                                                        |
                                                        |
                                                +-------v-------+
                                                |               |
                                                | Database Pods |
                                                |   (DB Tier)   |
                                                +---------------+
```

### Implementation: Building the Policy Engine

#### 1. The Default-Deny Stance

The cornerstone of a secure cluster network is the default-deny policy. When applied to a namespace, it drops all ingress and egress traffic that isn't explicitly allowed by another policy. 

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {} # Selects all pods in the namespace
  policyTypes:
  - Ingress
  - Egress
```

*Note: Egress default-deny requires you to explicitly whitelist CoreDNS traffic, otherwise pods won't be able to resolve services.*

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: production
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
```

#### 2. Permitting Web Ingress

Allow external traffic from the Ingress controller to the frontend pods on a specific port.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: web-allow-external
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: web
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: ingress-nginx
    ports:
    - protocol: TCP
      port: 8080
```

#### 3. Isolating Backend and Database Communication

Restrict the Backend (App) to only accept traffic from the Web tier. Concurrently, restrict the Database to only accept traffic from the App tier.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app-allow-web
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: app
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tier: web
    ports:
    - protocol: TCP
      port: 3000
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: db-allow-app
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: db
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tier: app
    ports:
    - protocol: TCP
      port: 5432
```

### Operational Considerations

*   **CNI Requirement:** NetworkPolicies require a CNI plugin that enforces them (e.g., Calico, Cilium, Weave). Flannel (by itself) does not enforce policies.
*   **Additive Logic:** NetworkPolicies are purely additive. There is no "deny" rule (other than omitting an "allow"). If any policy allows traffic, it is permitted.
*   **Testing:** Always test policies in a dry-run or staging environment. A misconfigured egress policy can break service discovery and monitoring agents immediately.
