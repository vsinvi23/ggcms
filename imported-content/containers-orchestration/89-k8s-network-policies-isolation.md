# Kubernetes Network Policies: Hardening Pod-to-Pod Traffic

## The Flat Network Problem
By default, Kubernetes clusters operate on a "flat network" model. Every pod can communicate with every other pod across all namespaces without restriction. While this accelerates initial development and simplifies service discovery, it introduces a catastrophic security flaw in production. If a single externally facing pod (like a web frontend) is compromised, an attacker can pivot laterally to access internal databases, cache instances, or billing services that were never meant to be publicly accessible.

This lack of internal boundaries violates the principle of least privilege. To secure a cluster, you must transition from a default-allow posture to a default-deny posture, explicitly permitting only necessary traffic.

## Mental Model: Default Deny and Explicit Allow
Think of Kubernetes Network Policies as highly granular, dynamic firewalls for your pods. Instead of IP addresses (which change constantly in Kubernetes), Network Policies use Pod Selectors and Namespace Selectors to define rules.

A Network Policy evaluates traffic based on three core concepts:
1. **Target Pods**: Which pods does this policy apply to?
2. **Ingress (Inbound)**: What traffic is allowed *into* the target pods?
3. **Egress (Outbound)**: What traffic is allowed *out of* the target pods?

```text
[External Traffic] --> (Ingress Controller) --> [Frontend Pods]
                                                    |
             (Network Policy: Allow Ingress from Frontend ONLY)
                                                    v
                                            [Backend Pods]
                                                    |
             (Network Policy: Allow Egress to DB ONLY)
                                                    v
                                              [Database]
```

## Implementation: Enforcing Default-Deny
The first step in hardening a namespace is to deploy a "Default-Deny" policy. Once this policy is applied, all traffic that is not explicitly allowed by another policy is dropped.

Here is the configuration for a baseline default-deny policy that blocks all ingress and egress traffic for a specific namespace:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production-app
spec:
  podSelector: {} # An empty selector matches ALL pods in the namespace
  policyTypes:
  - Ingress
  - Egress
```

### Warning on DNS Resolution
A total default-deny policy also blocks DNS resolution (typically CoreDNS on UDP port 53). If your pods cannot resolve internal service names, they will fail to connect. You must explicitly allow egress to the `kube-system` namespace for DNS.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: production-app
spec:
  podSelector: {}
  policyTypes:
  - Egress
  egress:
  - to:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: kube-system
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

## Establishing Application Boundaries
Once the default-deny baseline is established, you can selectively open traffic pathways. Consider a classic three-tier architecture: Frontend, Backend, and Database.

### 1. Allowing Ingress to Frontend
The frontend pods should only accept traffic from the cluster's Ingress controller.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-ingress
  namespace: production-app
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          network-role: ingress-controller
    ports:
    - protocol: TCP
      port: 8080
```

### 2. Allowing Frontend to Backend
The backend should only accept ingress from the frontend, and the frontend must be allowed egress to the backend.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: backend-allow-frontend
  namespace: production-app
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 3000
```

*Note: You would also need a corresponding Egress policy on the frontend targeting the backend pods.*

## Verifying Network Policies
Network policies are implemented by the Container Network Interface (CNI) plugin (e.g., Calico, Cilium, Weave Net). The Kubernetes API server simply stores the rules; the CNI enforces them.

To verify policies, do not rely on standard `ping` if ICMP traffic is blocked (NetworkPolicies operate at OSI Layer 3/4, often explicitly targeting TCP/UDP ports). Instead, use `nc` (netcat) or `curl` to test specific ports.

```bash
# Exec into a rogue pod
kubectl exec -it rogue-pod -n production-app -- sh

# Attempt to access the database (Should timeout)
nc -vz db-service.production-app.svc.cluster.local 5432
```

## Conclusion
Kubernetes Network Policies are non-negotiable for secure cluster operations. By layering a default-deny posture with explicit, label-based allow rules, you mathematically limit the blast radius of any potential compromise. Always ensure your CNI provider supports Network Policies, as some lightweight distributions (like Flannel in its default state) do not enforce them without additional configuration.