# Kubernetes Deployments: Helm Charts vs Kustomize Declarative Overlays

Deploying an application to multiple Kubernetes clusters (e.g., Development, Staging, Production) introduces a major configuration management challenge. While the core application architecture remains identical, environment-specific details—such as replica counts, resource allocations, environment variables, ingress hostnames, and secret configurations—vary.

This leads to a dilemma: how do you manage these configurations without falling into the trap of massive code duplication or unmaintainable template structures?

The cloud-native ecosystem offers two primary paradigms: **Helm** (a parameter-driven package manager) and **Kustomize** (a template-free, declarative overlay tool). In this article, we analyze both strategies and demonstrate production-grade configurations for each.

---

## Technical Architecture: Templating vs. Overlays

The core architectural differences between Helm and Kustomize represent distinct design philosophies:

* **Helm** uses Go templating to compile a parameterized directory into plain Kubernetes manifests. It acts as an active deployment agent, keeping track of releases as distinct historical revisions in cluster secrets.
* **Kustomize** relies on a static `base` configuration. It applies declarative patches via `overlays` (mutating the base YAML structure) at compile time. It has no template syntax, is client-side only, and is built directly into `kubectl`.

```text
================================================================================
   HELM: TEMPLATE RENDERING
================================================================================
   Templates (deployment.yaml) + Values (prod-values.yaml) 
        |
        +-----> [ Helm Engine ] -----> Rendered Manifests -----> [ Kubernetes API ]

================================================================================
   KUSTOMIZE: DECLARATIVE OVERLAYS
================================================================================
   Base Resources (deployment.yaml, kustomization.yaml)
        |
        v
   Overlays (production/kustomization.yaml patch)
        |
        +-----> [ Kubectl Kustomize ] -----> Patched Manifests -> [ Kubernetes API ]
```

---

## Paradigm 1: Kustomize Declarative Overlays

Kustomize structures directories logically using inheritance. The common resources live in `base`, while environment-specific changes are defined as patches in `overlays`.

### File Structure
```text
kustomize-app/
├── base/
│   ├── deployment.yaml
│   ├── service.yaml
│   └── kustomization.yaml
└── overlays/
    ├── dev/
    │   └── kustomization.yaml
    └── prod/
        ├── kustomization.yaml
        └── replica-patch.yaml
```

### 1. Base Configuration (`base/kustomization.yaml`)
```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
- service.yaml
commonLabels:
  app: telemetry-collector
```

### 2. Base Deployment (`base/deployment.yaml`)
```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telemetry-collector
spec:
  replicas: 1
  selector:
    matchLabels:
      app: telemetry-collector
  template:
    metadata:
      labels:
        app: telemetry-collector
    spec:
      containers:
      - name: collector
        image: telemetry:v1.0.0
        ports:
        - containerPort: 8080
```

### 3. Production Overlay Configuration (`overlays/prod/kustomization.yaml`)
In production, we inherit the base resources, append a suffix to the resource names, inject production-specific environment variables, and apply a patch to scale replicas and adjust resources.

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- ../../base
nameSuffix: -prod
commonAnnotations:
  environment: production
patches:
- path: replica-patch.yaml
```

### 4. Production Patch (`overlays/prod/replica-patch.yaml`)
This patch targets our deployment specifically to scale replicas and specify limits:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: telemetry-collector
spec:
  replicas: 5
  template:
    spec:
      containers:
      - name: collector
        resources:
          limits:
            cpu: "2"
            memory: 2Gi
          requests:
            cpu: "1"
            memory: 1Gi
```

To render the final production manifests, execute:
```bash
kubectl kustomize overlays/prod/
```

---

## Paradigm 2: Helm Parameter-Driven Charts

Helm structures the application as a re-usable package (a "Chart") and leverages variables to drive customizations.

### File Structure
```text
helm-chart/
├── Chart.yaml
├── values.yaml
├── values-prod.yaml
└── templates/
    ├── _helpers.tpl
    ├── deployment.yaml
    └── service.yaml
```

### 1. The Helm Template (`templates/deployment.yaml`)
Instead of hardcoded parameters, we write placeholders using Go template syntax:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ include "helm-chart.fullname" . }}
  labels:
    {{- include "helm-chart.labels" . | nindent 4 }}
spec:
  replicas: {{ .Values.replicaCount }}
  selector:
    matchLabels:
      {{- include "helm-chart.selectorLabels" . | nindent 6 }}
  template:
    metadata:
      labels:
        {{- include "helm-chart.selectorLabels" . | nindent 8 }}
    spec:
      containers:
      - name: {{ .Chart.Name }}
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag | default .Chart.AppVersion }}"
        resources:
          {{- toYaml .Values.resources | nindent 10 }}
```

### 2. Default Values (`values.yaml`)
Provides sensible default values (typically for Development environments):

```yaml
replicaCount: 1
image:
  repository: telemetry
  tag: "v1.0.0"
resources:
  requests:
    cpu: 100m
    memory: 128Mi
```

### 3. Production Values Override (`values-prod.yaml`)
Overrides the defaults strictly for production deployments:

```yaml
replicaCount: 5
resources:
  limits:
    cpu: "2"
    memory: 2Gi
  requests:
    cpu: "1"
    memory: 1Gi
```

To install the Helm chart with your production overrides:
```bash
helm upgrade --install telemetry-prod ./helm-chart \
  --namespace production \
  -f values-prod.yaml
```

---

## Analytical Comparison: When to Use Which?

| Evaluated Dimension | Helm | Kustomize |
| :--- | :--- | :--- |
| **Paradigm** | Programmatic Templating | Strategic Layered Patching |
| **Complexity** | High (Requires learning Go template syntax) | Low (Pure Kubernetes YAML) |
| **Dynamic Capabilities**| High (Loops, conditionals, helper functions) | None (Static patching only) |
| **Release Management** | Yes (Keeps history of versions, rollback support) | No (Purely outputs YAML, relies on git/ArgoCD) |
| **Ideal Use Case** | Third-party software, sharing packaged apps | Custom in-house apps, GitOps/ArgoCD pipelines |

### Choosing Your Tool
* Use **Helm** if you are distributing your application to external consumers, need runtime conditionals, or require complex lifecycle hook management during upgrades.
* Use **Kustomize** if you are using GitOps engines like ArgoCD or Flux, prefer "no-template" standard YAML files, and want to easily maintain slight variations of your in-house configurations without writing complex code.
