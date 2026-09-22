# Hardening Kubernetes Pod-to-Pod Traffic with Default-Deny Network Policies

By default, the Kubernetes flat networking model operates under a highly permissive assumption: any pod can communicate with any other pod in the cluster, regardless of namespace or functional tier. While this simplifies initial application deployment, it represents a catastrophic security risk. If an attacker compromises a single public-facing frontend web pod, they can easily pivot laterally to internal backend services, databases, or sensitive telemetry endpoints.

This article details how to establish zero-trust network boundaries within your cluster using native Kubernetes `NetworkPolicies`, transitioning from a default-allow topology to a hardened, explicit default-deny model.

---

## The Lateral Movement Threat Vector

In a default Kubernetes installation, a cluster-wide flat network permits all traffic. If a frontend pod running in the `frontend` namespace is compromised via a Remote Code Execution (RCE) vulnerability, the attacker can scan the entire internal pod network.

```
       [ Internet ]
            │
            ▼ (Exploited via RCE)
     ┌──────────────┐
     │ Frontend Pod │ 
     └──────┬───────┘
            │
            ├───────────────────────┐
            ▼ (Unauthorized)        ▼ (Unauthorized)
     ┌──────────────┐        ┌──────────────┐
     │ Backend Pod  │        │ Database Pod │
     │  (Port 8080) │        │  (Port 5432) │
     └──────────────┘        └──────────────┘
```

Without isolation, the network interface does not restrict cross-namespace or cross-tier lateral connection attempts. To prevent this, the cluster's network must be segmented using Network Policies enforced by a compatible Container Network Interface (CNI) like Calico, Cilium, or Weave Net.

---

## Architecture: Zero-Trust Pod Isolation

To secure pod communications, we must implement an explicit default-deny architecture. We then selectively white-list required traffic paths:

```
       [ Internet ]
            │
            ▼
     ┌──────────────┐
     │ Frontend Pod │
     └──────┬───────┘
            │ (Allowed Egress)
            ▼ (Port 8080 Only)
     ┌──────────────┐
     │ Backend Pod  │
     └──────┬───────┘
            │ (Allowed Egress)
            ▼ (Port 5432 Only)
     ┌──────────────┐
     │ Database Pod │
     └──────────────┘
```

In this architecture, any traffic not explicitly defined in a policy is dropped at the kernel or vSwitch layer by the CNI, preventing port scanning and unauthorized lateral exploration.

---

## Hardened Policy Manifests

### 1. The Foundation: Namespace-wide Default Deny

You must apply a catch-all default-deny policy to every namespace. This forces all ingress and egress traffic to be explicitly authorized.

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

*Note: An empty `podSelector: {}` targets all pods in the namespace. Having empty `ingress` and `egress` arrays means no traffic is white-listed, effectively blocking all incoming and outgoing connections.*

### 2. Securing the Database: Selective Ingress

Next, we define a policy for the database pods (e.g., PostgreSQL). This policy allows ingress *only* from pods matching the label `app: backend` on port 5432, while blocking all other ingress.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: database-allow-backend
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: database
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: backend
    ports:
    - protocol: TCP
      port: 5432
```

### 3. Restricting the Backend: Managed Egress and Ingress

The backend service needs to receive requests from the frontend on port 8080 and send requests to the database on port 5432. It also needs egress to CoreDNS for name resolution.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
  egress:
  # Allow traffic to the Database
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 5432
  # Allow DNS resolution (CoreDNS usually runs in kube-system)
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

---

## Technical Nuances and Pitfalls

### DNS Resolution Failures
When implementing `Egress` default-deny policies, applications will immediately break due to their inability to resolve DNS names. Always ensure you explicitly allow egress to port 53 (UDP and TCP) on the `kube-dns` pods in the `kube-system` namespace, as shown in the backend policy above.

### Combining Namespace and Pod Selectors
When whitelisting cross-namespace traffic, be careful with the array structure in the `from` block:

```yaml
# INCORRECT: Matches any pod in frontend namespace OR any pod with app: backend in any namespace
- namespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: frontend
  podSelector:
    matchLabels:
      app: backend

# CORRECT: Matches app: backend pods ONLY within the frontend namespace
- namespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: frontend
  podSelector:
    matchLabels:
      app: backend
```

By enforcing these strict boundaries, you secure your cluster's network boundaries, drastically reducing the blast radius of any compromised pod.
