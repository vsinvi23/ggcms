---
title: "Helm vs Kustomize: Templating, Overlays, and the Hybrid Approach"
description: "A practical comparison of Helm's Go-template rendering and Kustomize's template-free overlay patching for managing Kubernetes manifests across dev, staging, and production, including when to combine both."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "helm"
  - "kustomize"
  - "kubernetes-manifests"
  - "gitops"
  - "configuration-management"
---

# Helm vs Kustomize: Templating, Overlays, and the Hybrid Approach

## The Problem: The YAML Duplication Trap

Managing raw Kubernetes resource manifests across multiple environments (development, staging, production) is a notorious operational challenge. A standard deployment requires a Deployment, Service, ConfigMap, Ingress, and ServiceAccount. Copying and pasting this block of YAML for each environment quickly leads to configuration drift — a change to a database port or environment variable in development is easily forgotten in staging or production.

```text
Multi-Environment Duplication (Unmanaged):
  dev/deployment.yaml   ---> (Copy-pasted, hardcoded dev values)
  stage/deployment.yaml ---> (Copy-pasted, hardcoded staging values)
  prod/deployment.yaml  ---> (Copy-pasted, hardcoded prod values, drift occurs!)
```

To manage configuration safely at scale, platform engineers need tools that let them define a common deployment blueprint and programmatically inject environment-specific overrides. The two dominant solutions in the cloud-native ecosystem are **Helm** and **Kustomize**, and they take fundamentally different approaches.

```text
1. HELM (Parameterized Templating Engine):
   [ Blueprints with Go Templates ] + [ values.yaml Overrides ] ===(Interp)===> [ Rendered YAML ]

2. KUSTOMIZE (Template-Free Overlay Engine):
   [ Base YAML (Valid Manifests) ]  + [ Overlay Patches ] =====(Merge)===> [ Structured YAML ]
```

### Helm: The Parameterized Package Manager

Helm treats your application as a packaged "Chart." It relies on Go templating syntax inside YAML files. Helm parses these templates, looks up variables in a `values.yaml` file (or CLI flags), and interpolates strings to produce the final YAML. It also tracks release history natively in Secrets stored in the cluster.

### Kustomize: The Template-Free Overlay Engine

Kustomize avoids templating and string interpolation entirely. It relies on a **base and overlay** architecture: the base folder contains valid, standard Kubernetes manifests; environment-specific overlay folders contain a `kustomization.yaml` that specifies strategic merge patches. Kustomize parses the base YAML into a structured object tree, merges the overlay's patches directly into that tree, and emits the resulting manifest — no text substitution involved.

## Implementation: Kustomize Bases and Overlays

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
    └── production/
        ├── patch-deployment.yaml<-- Increases replicas and resources
        └── kustomization.yaml   <-- Applies patches, sets namespace/prefix
```

### 1. The Base Configuration

`base/deployment.yaml` is valid Kubernetes YAML you could `kubectl apply` directly:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-processor
spec:
  replicas: 1
  template:
    spec:
      containers:
      - name: processor
        image: company/processor:v1
```

`base/kustomization.yaml` just lists the resources:

```yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
resources:
- deployment.yaml
```

### 2. The Production Overlay

The `overlays/production` directory defines how production differs from the base — more replicas, added resource limits, a dedicated namespace, and a specific image tag:

```yaml
# overlays/production/patch-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: order-processor
spec:
  replicas: 5 # Strategic merge patch
  template:
    spec:
      containers:
      - name: processor
        resources: # Add resource limits
          limits:
            cpu: "2"
            memory: 2Gi
```

```yaml
# overlays/production/kustomization.yaml
apiVersion: kustomize.config.k8s.io/v1beta1
kind: Kustomization
namespace: prod-namespace
namePrefix: prod-
resources:
- ../../base
patchesStrategicMerge:
- patch-deployment.yaml
images:
- name: company/processor
  newName: company/processor
  newTag: v2.4.1 # Dynamically rewrite the image tag
```

Render and apply the production configuration:

```bash
kubectl apply -k overlays/production
```

## Implementation: The Helm Equivalent

`templates/deployment.yaml` (Go-templated YAML):

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: {{ .Release.Name }}-processor
spec:
  replicas: {{ .Values.replicaCount }}
  template:
    spec:
      containers:
      - name: processor
        image: "{{ .Values.image.repository }}:{{ .Values.image.tag }}"
```

`values.yaml` (default parameters, overridden per environment with `-f values-production.yaml` or `--set`):

```yaml
replicaCount: 1
image:
  repository: company/processor
  tag: v1
```

```bash
helm install order-processor ./chart -f values-production.yaml
```

## Choosing the Right Tool for the Job

| Feature | Helm | Kustomize |
| :--- | :--- | :--- |
| **Philosophy** | Parameterized templating | Structured merging / overlaying |
| **Parsing model** | Text-based interpolation (Go templates) | Schema-aware syntax-tree parsing |
| **Base readability** | Lower — obscured by conditional markup | Higher — plain, valid Kubernetes YAML |
| **Complexity** | Higher (learn Go templates, loops, hooks) | Lower (pure YAML, no string interpolation) |
| **Distribution** | Ideal for sharing off-the-shelf software (packaged charts) | Built directly into `kubectl` (`kubectl apply -k`) |
| **Versioning** | Tracks release history natively in cluster Secrets | No internal state — relies on Git/GitOps history |
| **Dependencies** | Requires the Helm CLI binary | Native to `kubectl`, no extra tooling |

For third-party software (Prometheus, Postgres, ingress-nginx), **Helm** is the gold standard — it packages full operational dependency graphs and version-tracked releases. For internal applications where you write and own the code, **Kustomize** is often preferred: manifests stay plain and readable, there's no template-parsing failure mode, and it integrates cleanly with GitOps controllers like ArgoCD or Flux.

## The Hybrid Approach

These tools aren't mutually exclusive. A common best practice is to use Helm to fetch and render a third-party chart, then use Kustomize to patch the rendered output for your environment — without forking the upstream chart:

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

This gives you the benefit of Helm's upstream chart maintenance (version bumps, security patches from the chart authors) while keeping your local customizations in clean, patch-based Kustomize form rather than a forked, drifting copy of someone else's `templates/` directory.

## Conclusion

Helm and Kustomize solve the same underlying problem — configuration drift across environments — with opposite philosophies: text templating versus structural patching. Neither is strictly superior; the right choice (or combination) depends on whether you're distributing software to others (Helm's strength) or customizing your own or someone else's manifests for your specific environment (Kustomize's strength).
