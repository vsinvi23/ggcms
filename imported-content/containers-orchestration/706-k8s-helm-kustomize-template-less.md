# Declarative Kubernetes Manifests: Helm Parameterized Charts vs Kustomize Template-less Patching

As software progresses from development to staging and into production, deployment requirements vary. Ports, replica counts, ingress domains, and environment configurations must adapt dynamically. Managing these variations with duplicate raw YAML manifests leads to configuration drift, errors, and delivery bottlenecks.

To manage configurations dynamically, the Kubernetes ecosystem has consolidated around two prominent strategies: **Helm** (parameterized template engine and package manager) and **Kustomize** (template-less overlays and declarative patching).

---

## Templating (Helm) vs Declarative Overlays (Kustomize)

Helm treats your manifests as text templates. It injects values into variables before rendering the final YAML documents:

```
[ values.yaml ] ────┐
                    ▼
[ templates/ ] ──► [ Helm Engine ] ──► [ Rendered Manifests ] ──► [ K8s API ]
```

In contrast, Kustomize leaves manifests completely untouched. It takes a solid "Base" layer of working YAML and applies strategic, type-safe structural overrides (patches) on top:

```
[ Base YAML ] ────┐
                  ▼
[ Patch Overlay ] ──► [ Kustomize Engine ] ──► [ Consolidated Manifests ]
```

---

## Technical Implementations: Comparing both Toolsets

Let's analyze how both tools modify a production deployment's replica count and apply environment labels.

### 1. The Helm Implementation

#### A. The Template file (`templates/deployment.yaml`)
Variables are marked using Go template syntax `{{ .Values.xyz }}`.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "app.fullname" . }}
  labels:
    app.kubernetes.io/environment: {{ .Values.environment }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      app: {{ include "app.name" . }}
  template:
    metadata:
      labels:
        app: {{ include "app.name" . }}
    spec:
      containers:
      - name: web
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
```

#### B. The Parameter values file (`values-production.yaml`)
Values are injected during release management commands.

```yaml
environment: production
replicaCount: 5
image:
  repository: registry.company.com/web-app
  tag: v2.4.1
```

*Execution:* `helm install my-app ./my-chart -f values-production.yaml`

---

### 2. The Kustomize Implementation

#### A. The Base Manifest (`base/deployment.yaml`)
This is a standard, fully functional plain-text Kubernetes resource.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web-app
spec:
  replicas: 2
  template:
    spec:
      containers:
      - name: web
        image: registry.company.com/web-app:latest
```

#### B. The Production Overlay config (`overlays/production/kustomization.yaml`)
Instead of variables, we declare the base reference, apply metadata injection, and supply patch files.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base

# Automatically injects production labels to all resources
commonLabels:
  app.kubernetes.io/environment: production

# Applies surgical modifications to specific blocks
patches:
- target:
    kind: Deployment
    name: web-app
  patch: |-
    apiVersion: apps/v1
    kind: Deployment
    metadata:
      name: web-app
    spec:
      replicas: 5
```

*Execution:* `kubectl apply -k overlays/production/`

---

## Architectural Decision Framework

| Feature | Helm (Templating & Packing) | Kustomize (Overlays & Patching) |
| :--- | :--- | :--- |
| **Parsing Model** | Text-based interpolation (Go Templates) | Schema-aware syntax tree parsing |
| **Base Readability**| Low (Obscured by conditional markup blocks) | High (Standard working Kubernetes files) |
| **State Tracking**  | Tracks releases in cluster Secrets | No internal state tracking (Requires Git/GitOps) |
| **Dependencies** | Requires Helm CLI tool binary installs | Natively built into standard `kubectl` CLI tool |

### When to choose Helm
Use Helm when you are building reusable, open-source charts designed to be distributed to third parties. Helm excel at abstracting package updates, version rollbacks, and lifecycle hook execution.

### When to choose Kustomize
Use Kustomize for internal application infrastructure managed by GitOps systems (like ArgoCD or Flux). It prevents "YAML programming" hell, keeps definitions readable, and ensures your configurations remain fully compliant with native Kubernetes schemas.

Choosing the right tool prevents template bloat, simplifies automation, and reduces configuration drift across environment boundaries.
