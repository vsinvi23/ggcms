# Kubernetes Network Policies: Hardening Pod-to-Pod Traffic and Default-Deny

## The Problem: The Flat Network Fallacy
By default, Kubernetes implements a flat network model. Every pod can communicate with every other pod across all namespaces without restriction. While this accelerates development and simplifies initial deployments, it represents a catastrophic security vulnerability in production. 

If a public-facing frontend pod is compromised via a zero-day vulnerability (e.g., an RCE in a vulnerable library), the attacker gains unrestricted lateral movement capabilities. They can pivot directly to backend microservices, query internal databases, or probe cloud metadata APIs. Without network segmentation at the pod level, the blast radius of a single container compromise is the entire cluster.

## The Architecture: Multi-Tier Isolation
To contain lateral movement, we must implement a Zero-Trust network posture using Kubernetes Network Policies. This involves moving from a "default-allow" to a "default-deny" state, followed by granular, explicitly allowed communication paths.

Consider a standard three-tier architecture:

```text
    [ Internet ]
         |
    [ Ingress ]
         | (Namespace: web)
+------------------+
|   Frontend Pod   |
+------------------+
         | (Only Web -> App allowed)
         v (Namespace: app)
+------------------+
|   Backend Pod    |
+------------------+
         | (Only App -> DB allowed)
         v (Namespace: data)
+------------------+
|   Database Pod   |
+------------------+
```

In this model, the database pod should *never* accept connections from the frontend pod, and no pod should be able to initiate outbound connections to the broader internet unless explicitly permitted.

## Implementation: The Default-Deny Posture
The cornerstone of network hardening is the **Default-Deny** policy. When a `NetworkPolicy` is applied to a namespace and selects a pod, that pod becomes "isolated". We start by isolating everything.

### 1. The Global Default-Deny Policy
Apply this to every namespace in your cluster. It drops all Ingress and Egress traffic by default.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: my-app
spec:
  podSelector: {} # Selects ALL pods in the namespace
  policyTypes:
  - Ingress
  - Egress
```

*Note: Egress blocking will also block DNS resolution unless explicitly allowed. You must punch a hole for CoreDNS.*

### 2. Allowing CoreDNS (Egress)
Without DNS, your pods cannot resolve internal service names.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-dns-egress
  namespace: my-app
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

### 3. Granular Tier-to-Tier Allowances
Now, we explicitly allow the `frontend` to communicate with the `backend`.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: allow-frontend-to-backend
  namespace: app
spec:
  podSelector:
    matchLabels:
      app: backend
  policyTypes:
  - Ingress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: web
      podSelector:
        matchLabels:
          app: frontend
    ports:
    - protocol: TCP
      port: 8080
```

## Caveats and CNI Requirements
Network Policies are a Kubernetes API abstraction. They do *not* enforce traffic themselves. Enforcement is entirely delegated to the Container Network Interface (CNI) plugin (e.g., Calico, Cilium, Weave, or Antrea). If you are using a basic CNI like Flannel (without policy enforcement enabled) or AWS VPC CNI (without the network policy agent), applying these YAMLs will result in a silent failure—the rules will be accepted by the API server but completely ignored by the network.

## Conclusion
Hardening pod-to-pod traffic via NetworkPolicies is non-negotiable for enterprise Kubernetes. By establishing a strict default-deny baseline and selectively allowing necessary ingress and egress paths, you severely limit the potential blast radius of compromised workloads, enforcing structural least-privilege at the network layer.
