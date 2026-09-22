# Kubernetes Network Policies: Hardening Pod-to-Pod Traffic and Default-Deny

By default, Kubernetes network plugins operate under a flat, non-isolated network model. Every Pod in a cluster can communicate with every other Pod, across all namespaces, without any restriction. While this accelerates initial development, it introduces severe security risks in production. If a single public-facing frontend Pod is compromised, an attacker can move laterally across the network, scanning and accessing backend services, database instances, and cluster metadata endpoints.

To secure cluster workloads, you must adopt a zero-trust model. This is achieved by enforcing a default-deny security posture and explicitly whitelisting authorized traffic pathways.

---

## Technical Architecture: Multi-Tier Isolation

Securing a classic three-tier application—consisting of a public frontend, an internal API backend, and a database layer—requires strict traffic isolation. 

The security boundaries are designed as follows:
1. **Frontend** allows public ingress from the Ingress Controller but is blocked from communicating directly with the Database.
2. **Backend** allows ingress only from the Frontend and can communicate with both the Frontend (responses) and the Database (egress).
3. **Database** allows ingress only from the Backend on its specific port (e.g., 5432) and blocks all egress.
4. **All Tiers** apply a Default-Deny posture to prevent any unsolicited or unauthorized network traffic.

```text
               +----------------------+
               |  Ingress Controller  |
               +----------+-----------+
                          | (HTTP/80, 443)
                          v
               +----------------------+
               |     Frontend Pod     | (app=frontend)
               +----------+-----------+
                          | (HTTP/8080)
                          v
               +----------------------+
               |     Backend Pod      | (app=backend)
               +----------+-----------+
                          | (PostgreSQL/5432)
                          v
               +----------------------+
               |     Database Pod     | (app=database)
               +----------------------+
```

---

## Step 1: Enforcing Default-Deny Ingress and Egress

The foundational step is to apply a global default-deny NetworkPolicy in the namespace. This acts as an opt-in firewall: once applied, all Pods in the namespace are isolated, and any communication must be explicitly whitelisted.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: default-deny-all
  namespace: production
spec:
  podSelector: {}
  policyTypes:
  - Ingress
  - Egress
```

### Key Considerations:
* `podSelector: {}` targets all pods in the `production` namespace.
* `policyTypes` containing both `Ingress` and `Egress` ensures that no packets can enter or leave any pod unless an explicit rule allows it.
* Applying this policy will break core services like DNS resolution (`kube-dns`), which must be explicitly whitelisted for egress.

---

## Step 2: Enabling Core Cluster Egress (DNS)

To allow Pods to resolve internal and external hostnames, we must explicitly permit DNS lookup egress on UDP/TCP port 53.

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
  yaml
  egress:
  - to:
    - namespaceSelector: {}
      podSelector:
        matchLabels:
          k8s-app: kube-dns
    ports:
    - protocol: UDP
      port: 53
    - protocol: TCP
      port: 53
```

---

## Step 3: Multi-Tier Whitelisting

Now, we define surgical rules to allow traffic through our application tiers.

### Frontend Network Policy

The Frontend Pods accept ingress from the Ingress Controller (running in the `ingress-nginx` namespace) and allow egress only to the Backend Pods.

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: frontend-policy
  namespace: production
spec:
  podSelector:
    matchLabels:
      app: frontend
  policyTypes:
  - Ingress
  - Egress
  ingress:
  - from:
    - namespaceSelector:
        matchLabels:
          kubernetes.io/metadata.name: ingress-nginx
    ports:
    - protocol: TCP
      port: 80
  egress:
  - to:
    - podSelector:
        matchLabels:
          app: backend
    ports:
    - protocol: TCP
      port: 8080
```

### Backend Network Policy

The Backend Pods accept ingress only from the Frontend Pods and are allowed egress to the Database Pods.

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
  - to:
    - podSelector:
        matchLabels:
          app: database
    ports:
    - protocol: TCP
      port: 5432
```

### Database Network Policy

The Database Pods accept ingress strictly from the Backend Pods on port 5432 and have no permitted egress (relying on the global default-deny).

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: database-policy
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

---

## Verification and Policy Enforcement

NetworkPolicies are stateful: whitelisting ingress automatically allows the corresponding egress response, and vice-versa. To verify these rules, deploy a temporary debugging pod and attempt connection commands:

```bash
# Verify Database blocks direct connections from Frontend
kubectl exec -it frontend-pod -n production -- nc -zv database-service 5432 -w 3
# Expected output: Connection timed out

# Verify Backend can connect to Database
kubectl exec -it backend-pod -n production -- nc -zv database-service 5432 -w 3
# Expected output: database-service (10.x.x.x:5432) open
```

By enforcing a default-deny posture and whitelisting strict paths, you reduce the attack surface of your Kubernetes cluster to the absolute minimum necessary for application functionality.
