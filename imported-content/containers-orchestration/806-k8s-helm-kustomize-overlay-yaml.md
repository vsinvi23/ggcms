# Kubernetes Deployments: Helm Charts vs Kustomize Declarative Overlays

### The Problem: Configuration Drift and YAML Sprawl

Managing Kubernetes configurations across multiple environments (Development, Staging, Production) often leads to extensive code duplication. Copy-pasting hundreds of lines of YAML for a `Deployment` just to change a replica count, image tag, or environment variable results in "YAML sprawl." When an architectural change is required (e.g., adding a sidecar container), operators must manually update every environment's distinct YAML files, inevitably causing configuration drift, errors, and release failures.

### The Solution: Templating vs. Patching

The Kubernetes ecosystem offers two primary paradigms to solve configuration sprawl:
1.  **Helm (Templating):** Uses Go templates to generate YAML dynamically based on variables supplied in a `values.yaml` file.
2.  **Kustomize (Patching):** Built into `kubectl`, it uses a declarative, overlay-based approach where standard YAML "bases" are modified by environment-specific "patches."

Understanding when to use which (or how to combine them) is critical for maintainable GitOps pipelines.

### Architecture: Kustomize Base and Overlay Model

Kustomize avoids templating logic (`if/else/range`) inside YAML. Instead, it relies on structural inheritance.

```text
├── base/
│   ├── deployment.yaml   <-- Standard, vanilla Kubernetes YAML
│   ├── service.yaml
│   └── kustomization.yaml<-- Defines resources in the base
│
└── overlays/
    ├── dev/
    │   ├── patch-replicas.yaml <-- Modifies replica count to 1
    │   └── kustomization.yaml  <-- Applies patches to base
    └── prod/
        ├── patch-resources.yaml<-- Increases CPU/RAM limits
        └── kustomization.yaml  <-- Applies patches to base
```

### Implementation: Kustomize Overlays

Let's build a configuration for production utilizing Kustomize.

#### 1. The Base Configuration

The `base/deployment.yaml` is valid Kubernetes YAML that can be applied directly if needed.

```yaml
# base/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: app
        image: registry/myapp:latest
```

The `base/kustomization.yaml` simply lists the resources.

```yaml
# base/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
```

#### 2. The Production Overlay

In the `overlays/prod` directory, we define how production differs from the base. We want more replicas, different resource limits, and a specific namespace.

```yaml
# overlays/prod/patch-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: myapp
spec:
  replicas: 5 # Patch the replica count
  template:
    spec:
      containers:
      - name: app
        resources: # Add resource limits
          limits:
            cpu: "2"
            memory: 2Gi
```

The `overlays/prod/kustomization.yaml` ties it together.

```yaml
# overlays/prod/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: prod-namespace
namePrefix: prod-
resources:
- ../../base
patchesStrategicMerge:
- patch-deployment.yaml
images:
- name: registry/myapp:latest
  newName: registry/myapp
  newTag: v2.4.1 # Dynamically rewrite the image tag
```

To render and apply the production configuration:
```bash
kubectl apply -k overlays/prod
```

### Helm vs. Kustomize: When to use what?

**Choose Helm when:**
*   You are distributing complex software to third parties (like an open-source database or monitoring stack).
*   The deployment requires conditional logic (e.g., `{{ if .Values.ingress.enabled }}`).
*   You need lifecycle management (hooks, rollbacks) tied to a "release."

**Choose Kustomize when:**
*   You are deploying internal applications within your organization.
*   You want to maintain pure, readable YAML without Go-template noise syntax.
*   You need to customize off-the-shelf YAML (or even Helm charts output) without rewriting it.

**The Hybrid Approach (Best Practice):**
You can use Helm to fetch and render a third-party chart (like Redis or Nginx), and use Kustomize to patch it, tailoring it to your environment without forking the upstream chart.

```yaml
# kustomization.yaml using Helm integration
helmCharts:
- name: ingress-nginx
  repo: https://kubernetes.github.io/ingress-nginx
  version: 4.8.0
  releaseName: my-ingress
patchesStrategicMerge:
- custom-affinity-patch.yaml
```
