# Istio Traffic Management: Canary Routing via Service Mesh

## The Problem: The Inflexibility of Standard Kubernetes Rollouts
When deploying updates to high-traffic production environments, deploying in place or using standard blue-green updates represents a major risk. A bug in the new release can crash the entire system, causing massive downtime.

To mitigate this, team leads often employ canary deployments, routing a small percentage of production traffic (such as 1% or 5%) to the new version (v2) while the remaining traffic stays on the stable version (v1).

However, attempting this with native Kubernetes resources is incredibly difficult. Standard Kubernetes Services route traffic randomly across all backend pods that match the service selector. To achieve a 1% canary split, you would have to run 99 replicas of v1 and 1 replica of v2. This results in:
1. **Extreme Resource Waste**: Over-allocating v1 replicas just to achieve a fine-grained routing ratio is incredibly expensive.
2. **Coarse Control**: You cannot split traffic based on dynamic parameters like user session IDs, HTTP headers, or JWT claims.

## Mental Model: Decoupling Routing from Pod Scaling
The Istio service mesh solves this problem by separating routing logic from container replication. Using Envoy sidecar proxies, routing becomes programmatic.

```
       [ Istio Ingress Gateway ]
                    │
                    ▼ (Evaluates VirtualService Rules)
         [ VirtualService: customer-vs ]
              │               │
     (90% Traffic)       (10% Traffic)
              │               │
              v               v
    [ DestinationRule: customer-dr ]
              │               │
      Subset: stable   Subset: canary
              │               │ (Selects labels: version=v2)
              │               │
              v               v
         [ Pods v1 ]     [ Pods v2 ]
```

- **VirtualService**: Manages traffic routing behavior. It parses incoming HTTP requests and assigns them to distinct target subsets based on weights or headers.
- **DestinationRule**: Manages target configurations. It defines the "subsets" (e.g., `stable` vs. `canary`) by matching corresponding labels on the underlying Kubernetes Pods.

## The Architectural Solution: Weighted Subsets
By using Istio, you can run a single replica of v2 and a single replica of v1, yet split traffic with exact percentage precision (like 99% to v1 and 1% to v2). Traffic splitting is handled in-flight at the Envoy proxy level, rather than relying on standard IP round-robin routing.

## Implementation: Staging the Canary Service Mesh

The following configurations implement a 90/10 canary split for a microservice named `customer-portal`.

### 1. Defining the Subsets (`destination-rule.yaml`)
We create the `DestinationRule` to group our pods into two distinct subsets based on the `version` label:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: DestinationRule
metadata:
  name: customer-portal-dr
  namespace: production
spec:
  host: customer-portal-service
  trafficPolicy:
    loadBalancer:
      simple: ROUND_ROBIN
  subsets:
    - name: stable
      labels:
        version: v1.12.0
    - name: canary
      labels:
        version: v2.0.0-rc1
```

### 2. Splitting Traffic in the Mesh (`virtual-service.yaml`)
Now, we define the `VirtualService` to split traffic 90/10 between the two subsets:

```yaml
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: customer-portal-vs
  namespace: production
spec:
  hosts:
    - "customer.serenya.edu"
  gateways:
    - customer-gateway
  http:
    - route:
        - destination:
            host: customer-portal-service
            subset: stable
          weight: 90
        - destination:
            host: customer-portal-service
            subset: canary
          weight: 10
          headers:
            response:
              set:
                x-canary-version: "v2"
```

## Advanced Scenario: Header-Based Sticky Canary Routing
In addition to weights, we can inject rules that route specific users to the canary based on HTTP cookies or headers, enabling seamless testing for internal QA teams:

```yaml
  http:
    - match:
        - headers:
            cookie:
              regex: ".*user_type=internal_qa.*"
      route:
        - destination:
            host: customer-portal-service
            subset: canary
    - route:
        - destination:
            host: customer-portal-service
            subset: stable
```

## Verifying Mesh Traffic Routing
Generate traffic against your ingress gateway and capture the returned header to verify routing metrics:

```bash
# Execute curl in a loop to track distribution
for i in {1..100}; do 
  curl -s -I http://customer.serenya.edu/index.html | grep "x-canary-version" || echo "stable"
done
```

The output will confirm that approximately 10% of requests receive the canary header, demonstrating perfect traffic distribution without the need to modify backend application replicas.
