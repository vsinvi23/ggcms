# Kubernetes Services Explained: The Problem with Ephemeral IPs

### The Problem

In Kubernetes, Pods are mortal. They are created, they die, and they are replaced. Every time a Pod spins up, it is assigned a new IP address from the cluster's internal network pool. 

If you have a backend application communicating with a database, you cannot hardcode the database Pod's IP address. If the database Pod dies and is rescheduled on another node, the backend will fail to connect. We need a stable abstraction—a persistent endpoint that proxies traffic to a dynamic set of backend Pods.

### The Solution: Services

A Kubernetes `Service` provides a stable IP address, a stable DNS name, and load balancing across a set of Pods. It acts as an abstraction layer decoupling the network identity from the underlying compute.

#### How Services Find Pods

Services use label selectors to identify which Pods they should route traffic to. If a Pod's labels match the Service's selector, it becomes an Endpoint for that Service.

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-backend
spec:
  selector:
    app: backend-api
  ports:
    - protocol: TCP
      port: 80
      targetPort: 8080
```

Any Pod in the same namespace with the label `app: backend-api` will receive traffic on its port `8080` when requests hit the Service's port `80`.

### The Three Service Types

Services come in three main flavors, each solving a different accessibility requirement.

#### 1. ClusterIP (The Default)

`ClusterIP` exposes the Service on an internal IP address accessible only from within the cluster.

```text
    [ Client Pod ]
          |
    (ClusterIP IP)
          V
   [ api-backend Service ]
      /       \
[Pod A]      [Pod B]
```

**When to use:** For internal communication, such as a frontend microservice talking to a backend API, or an API talking to a database. It ensures no external traffic can directly hit these components.

#### 2. NodePort

`NodePort` exposes the Service on the IP of each Node at a specific port (between 30000-32767). It builds on top of `ClusterIP`.

```text
       (Internet)
           |
    [ Node IP:30123 ]
           V
   [ api-backend Service ]
           V
      [ Backend Pod ]
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-nodeport
spec:
  type: NodePort
  selector:
    app: backend-api
  ports:
    - port: 80
      targetPort: 8080
      nodePort: 30123
```

**When to use:** Primarily used in local development (like Minikube or kind) or as a building block for external load balancers. Exposing NodePorts directly to the internet is generally an anti-pattern due to security and port-range limitations.

#### 3. LoadBalancer

`LoadBalancer` exposes the Service externally using a cloud provider's load balancer (e.g., AWS ELB, GCP Cloud Load Balancer). It builds on top of `NodePort` and `ClusterIP`.

```text
       (Internet)
           |
 [ Cloud Load Balancer ]
           |
    [ Node IP:30123 ]
           V
   [ api-backend Service ]
           V
      [ Backend Pod ]
```

```yaml
apiVersion: v1
kind: Service
metadata:
  name: api-loadbalancer
spec:
  type: LoadBalancer
  selector:
    app: backend-api
  ports:
    - port: 80
      targetPort: 8080
```

**When to use:** When you need a highly available, externally facing IP address routed directly to your cluster. It is the standard way to expose web applications in managed Kubernetes environments (EKS, GKE, AKS).

### The Reality of kube-proxy

Behind the scenes, Services are implemented by `kube-proxy`. Running on every node, `kube-proxy` watches the Kubernetes API for new Services and Endpoints. It configures `iptables` (or IPVS) rules on the host machine to intercept requests destined for the Service's IP and rewrite the destination to one of the backend Pods. 

This means that a "Service" isn't a dedicated routing process; it's a set of sophisticated iptables rules distributed across your entire cluster.
