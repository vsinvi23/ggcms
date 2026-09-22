# Kubernetes Explained Through a Real Application: Deploying a Web API with a Database

## The Problem: The Complexity of Multi-Tier Container Orchestration

Deploying a single isolated container (such as a stateless frontend) is relatively simple. However, real-world enterprise applications are composite systems. A typical architecture consists of a stateless web API and a stateful database (like PostgreSQL).

In production, running this multi-tier application introduces immediate operational complexities:
1.  **State Persistence**: If the database container crashes, any data written to its local disk is destroyed. How do we mount stable, durable storage that survives container lifecycles?
2.  **Service Discovery**: How does the web API locate and authenticate with the database container when the database container's IP address changes dynamically every time it is rescheduled?
3.  **Traffic Routing**: How do we securely route internet traffic into our internal stateless web API replicas while shielding the database completely from the external web?
4.  **Zero-Downtime Rollouts**: How do we update our API containers without dropping active client connections?

**Kubernetes (K8s)** provides a declarative model to orchestrate these complex interactions natively.

---

## Architectural Deep-Dive: Logical Application Topology

Kubernetes achieves this by mapping functional concerns to specialized resource objects. Below is the logical architecture of our multi-tier deployment:

```
                              [ Internet Traffic ]
                                       │
                                       ▼
                              [ K8s Ingress Controller ]
                                       │
                                       ▼ (Routes path "/api" to Web Service)
                     +───────────────────────────────────+
                     |        Web Service (ClusterIP)    |
                     +─────────────────┬─────────────────+
                                       │
                     ┌─────────────────┴─────────────────┐ (Load Balances across pods)
                     ▼                                   ▼
          +─────────────────────+             +─────────────────────+
          |  Web API Pod (Rep 1)|             |  Web API Pod (Rep 2)|
          |  (Injects DB Secret)|             |  (Injects DB Secret)|
          +──────────┬──────────+             +──────────┬──────────+
                     │                                   │
                     └─────────────────┬─────────────────┘
                                       │ (Locates DB via cluster network name)
                                       ▼
                     +───────────────────────────────────+
                     |         DB Service (ClusterIP)    |
                     +─────────────────┬─────────────────+
                                       │
                                       ▼
                     +───────────────────────────────────+
                     |        DB StatefulSet (Pod 0)     | <-- Stable Network Identity
                     |   Mounts PersistentVolume via PVC |
                     +─────────────────┬─────────────────+
                                       │
                                       ▼
                     +───────────────────────────────────+
                     |     PersistentVolume (Cloud Disk) | <-- Durable persistent storage
                     +───────────────────────────────────+
```

To deploy this topology, we define several declarative configurations:
*   **Secret**: Stores the sensitive database password securely, mounting it into target pods as environment variables.
*   **PersistentVolumeClaim (PVC)**: Formally requests a stable slice of persistent disk from the underlying cloud infrastructure.
*   **StatefulSet**: Orchestrates the database. Unlike a stateless `Deployment`, a `StatefulSet` guarantees that pods receive a persistent, ordinal identifier (e.g., `db-0`), stable network DNS name, and persistent storage linkage that remains bound even if the pod is destroyed and rescheduled.
*   **Deployment**: Manages our stateless web API pods, handling scaling, rollouts, and self-healing.
*   **Services**: Exposes stable IP addresses and DNS records, internal load-balancing requests to either the web API replicas or the database pod.

---

## Concrete Code: Complete Unified Kubernetes Manifest

Below is a production-grade, highly commented YAML manifest defining the entire application stack.

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: app-db-secret
  namespace: default
type: Opaque
stringData:
  # Sensitive credentials stored securely. 
  # K8s encodes these to Base64 in flight.
  postgres-user: postgres_admin
  postgres-password: SuperSecureSecretPassword123!
---
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: postgres-pvc
  namespace: default
spec:
  accessModes:
    - ReadWriteOnce # Mounted exclusively by a single node at a time
  resources:
    requests:
      storage: 10Gi # Requests 10 Gigabytes of persistent storage
---
apiVersion: v1
kind: Service
metadata:
  name: db-service
  namespace: default
spec:
  clusterIP: None # Headless Service. Prevents load-balancing; directly resolves pod IPs.
  selector:
    app: db-backend
  ports:
    - port: 5432
      targetPort: 5432
---
apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: db-statefulset
  namespace: default
spec:
  serviceName: db-service
  replicas: 1
  selector:
    matchLabels:
      app: db-backend
  template:
    metadata:
      labels:
        app: db-backend
    spec:
      containers:
        - name: postgres
          image: postgres:15-alpine
          ports:
            - containerPort: 5432
              name: dbport
          env:
            # Mount environment variables from Secret
            - name: POSTGRES_USER
              valueFrom:
                secretKeyRef:
                  name: app-db-secret
                  key: postgres-user
            - name: POSTGRES_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: app-db-secret
                  key: postgres-password
            - name: PGDATA
              value: /var/lib/postgresql/data/pgdata
          volumeMounts:
            # Mount physical storage to internal postgres directory
            - name: db-storage
              mountPath: /var/lib/postgresql/data
      volumes:
        - name: db-storage
          persistentVolumeClaim:
            claimName: postgres-pvc
---
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-api-deployment
  namespace: default
spec:
  replicas: 2 # Scale boundary: 2 redundant API pods
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 1 # Standard zero-downtime rolling update strategy
      maxUnavailable: 0
  selector:
    matchLabels:
      app: web-api
  template:
    metadata:
      labels:
        app: web-api
    spec:
      containers:
        - name: api-container
          image: node:18-alpine
          command: ["sh", "-c", "node -e \"const http = require('http'); const server = http.createServer((req, res) => { res.writeHead(200, {'Content-Type': 'application/json'}); res.end(JSON.stringify({status: 'API_ALIVE', db_connected: true})); }); server.listen(8080);\""]
          ports:
            - containerPort: 8080
              name: apiport
          env:
            - name: DB_HOST
              value: "db-service.default.svc.cluster.local" # Resolves DB pod via K8s DNS
            - name: DB_USER
              valueFrom:
                secretKeyRef:
                  name: app-db-secret
                  key: postgres-user
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: app-db-secret
                  key: postgres-password
          resources:
            limits:
              cpu: "500m"
              memory: "256Mi"
            requests:
              cpu: "100m"
              memory: "128Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: web-api-service
  namespace: default
spec:
  type: ClusterIP # Internal stable IP. Traffic routed here from Ingress
  selector:
    app: web-api
  ports:
    - port: 80
      targetPort: 8080
```

By submitting this single, unified document using `kubectl apply -f manifest.yaml`, Kubernetes instantiates the logical network, provisions persistent cloud block storage, injects sensitive credentials safely into container processes, scales the API layer across active cluster nodes, and maintains continuous system availability.
