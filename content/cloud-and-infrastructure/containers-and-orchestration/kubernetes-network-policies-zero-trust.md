---
title: "Kubernetes Network Policies: Default-Deny and Zero-Trust Pod Isolation"
description: "How to move a Kubernetes cluster from its flat, default-allow network model to a default-deny, explicitly-whitelisted three-tier architecture using NetworkPolicy resources, with DNS and cross-namespace selector pitfalls covered."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "network-policy"
  - "kubernetes-networking"
  - "zero-trust"
  - "cni"
  - "default-deny"
  - "lateral-movement"
---

# Kubernetes Network Policies: Default-Deny and Zero-Trust Pod Isolation

## The Problem: A Flat, Default-Allow Network

By default, every pod in a Kubernetes cluster can reach every other pod, across every namespace, with no restriction. That is convenient for getting a cluster running quickly, but it is a serious liability in production: if a single internet-facing pod — say, a web frontend with a remote code execution bug — is compromised, the attacker inherits unrestricted lateral movement to internal databases, caches, and billing services that were never meant to be reachable from the internet at all.

```text
       [ Internet ]
            |
            v  (Exploited via RCE)
     +--------------+
     | Frontend Pod |
     +------+-------+
            |
     +------+---------------------+
     v (unauthorized)              v (unauthorized)
+--------------+            +---------------+
| Backend Pod  |            | Database Pod  |
| (port 8080)  |            | (port 5432)   |
+--------------+            +---------------+
```

Without any policy, the network layer places no restriction on that lateral scan — the cluster is one flat trust domain.

## The Solution: Default-Deny, Then Explicit Allow

`NetworkPolicy` resources implement a firewall model at the pod level, matched by label selectors instead of IP addresses (since pod IPs are ephemeral). Each policy specifies:

1. **Target pods** — which pods this policy applies to (`podSelector`).
2. **Ingress rules** — what's allowed *in*.
3. **Egress rules** — what's allowed *out*.

`NetworkPolicy` objects are purely additive — there is no explicit "deny" rule type. The only way to deny traffic is to apply a policy that doesn't include it in an `allow` list, which is why the standard hardening pattern starts with a catch-all default-deny and then layers on narrow allow rules.

```text
       [ Internet ]
            |
            v
     +--------------+
     | Frontend Pod |
     +------+-------+
            | (allowed egress, port 8080 only)
            v
     +--------------+
     | Backend Pod  |
     +------+-------+
            | (allowed egress, port 5432 only)
            v
     +--------------+
     | Database Pod |
     +--------------+
```

Anything not explicitly permitted here is dropped by the CNI plugin, not by the API server — the API server only stores the policy object; enforcement is delegated entirely to a policy-aware CNI (Calico, Cilium, Weave). **Flannel in its default configuration does not enforce NetworkPolicy at all** — a cluster running plain Flannel will accept and store these objects while silently doing nothing with them.

## Step 1: The Default-Deny Baseline

Apply this to every namespace you intend to harden:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}      # Empty selector = every pod in the namespace
  policyTypes:
  - Ingress
  - Egress
```

An empty `podSelector: {}` combined with no `ingress`/`egress` blocks means: match everything, allow nothing.

## Step 2: Immediately Re-Allow DNS

This is the single most common outage caused by network policies. A total egress default-deny also blocks UDP/TCP port 53 to CoreDNS, so every pod immediately loses the ability to resolve service names — including its own liveness/readiness checks if they use hostnames.

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
    - protocol: TCP
      port: 53
```

Apply this in the same change as the default-deny policy — never leave a namespace in default-deny without a DNS allow rule, even for a "quick test."

## Step 3: Build the Three-Tier Allow List

Consider a standard web → app → database architecture. The goal: web can only be reached from ingress, app can only be reached from web, and the database can only be reached from app — nothing can skip a tier.

**Frontend: accept only from the ingress controller's namespace, on its serving port:**

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

**Backend: accept ingress only from the web tier, and grant only the egress it actually needs (database + DNS):**

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: app-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      tier: app
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - podSelector:
        matchLabels:
          tier: web
    ports:
    - protocol: TCP
      port: 3000
  egress:
  - to:
    - podSelector:
        matchLabels:
          tier: db
    ports:
    - protocol: TCP
      port: 5432
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

**Database: accept ingress only from the app tier, nothing else:**

```yaml
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

The frontend is never granted ingress rules on the database policy, and the database has no egress rules at all — it never needs to initiate outbound connections, so none are granted.

## The Cross-Namespace Selector Trap

A `from`/`to` array entry can combine `namespaceSelector` and `podSelector` — but whether they combine with AND or OR depends entirely on whether they're in the *same* list item or two separate ones. This single indentation difference is one of the most common NetworkPolicy authoring mistakes:

```yaml
# WRONG: two separate list entries = OR.
# Matches ANY pod in the "frontend" namespace, OR any pod
# labeled app: backend in ANY namespace — far broader than intended.
- namespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: frontend
- podSelector:
    matchLabels:
      app: backend
```

```yaml
# CORRECT: one list entry, two selectors = AND.
# Matches ONLY pods labeled app: backend, and only inside
# the "frontend" namespace.
- namespaceSelector:
    matchLabels:
      kubernetes.io/metadata.name: frontend
  podSelector:
    matchLabels:
      app: backend
```

Always review a rendered policy's YAML indentation carefully — a single misplaced `-` silently widens a rule from "one specific namespace/pod pair" to "either condition, cluster-wide."

## Verifying Enforcement

Don't rely on `ping` — NetworkPolicy operates at layer 3/4 and typically targets specific TCP/UDP ports, not ICMP, so a blocked pod may still respond to pings. Test with an actual connection attempt on the port you restricted:

```bash
# From inside a pod that should be denied database access:
kubectl exec -it rogue-pod -n production -- sh
nc -vz db-service.production.svc.cluster.local 5432
# Expected: connection attempt hangs / times out, not "connection refused"
```

A timeout indicates the packet was silently dropped by the CNI (policy is working); an instant "connection refused" usually means something else is going on (e.g., no policy applied, or the service simply isn't listening).

## Key Takeaways

- Kubernetes' network model is flat and default-allow; `NetworkPolicy` is required to enforce any pod-to-pod isolation, and it is purely additive — there's no explicit deny rule beyond omitting an allow.
- Always start with a namespace-wide `default-deny-all` and immediately follow with an explicit DNS-egress allow rule — skipping the DNS rule is the most common self-inflicted outage.
- Enforcement depends entirely on your CNI plugin (Calico, Cilium, Weave); Flannel's default mode silently ignores NetworkPolicy objects.
- A `namespaceSelector` and `podSelector` in the *same* list entry AND together; in *separate* list entries they OR together — get this wrong and a rule silently becomes far more permissive than intended.
