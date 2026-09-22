---
title: "Helm Hooks: Sequencing Database Migrations in a Release Lifecycle"
description: "Why running schema migrations inside application startup causes race conditions and privilege problems, and how a pre-install/pre-upgrade Helm hook Job solves it cleanly."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "helm"
  - "helm-hooks"
  - "kubernetes-jobs"
  - "database-migrations"
  - "deployment-lifecycle"
---

# Helm Hooks: Sequencing Database Migrations in a Release Lifecycle

## The Problem: The Startup Migration Anti-Pattern

In microservice architectures, applications often manage their own database schemas. A common, yet dangerous, anti-pattern is executing database migrations (Liquibase, Flyway, or custom scripts) during the application's startup phase — inside an `initContainer` or the main container's entrypoint.

While simple, this pattern introduces severe operational risks:

1. **Concurrent race conditions**: if you scale your application to 10 replicas, 10 separate pods attempt to execute the same schema modifications simultaneously. This can lead to database table locks, transactional deadlocks, or schema corruption.
2. **Privilege escalation**: running migrations inside the application container requires the application to connect with high-privileged DDL credentials (`CREATE`, `ALTER`). For security, application pods should only hold low-privileged DML rights (`SELECT`, `INSERT`, `UPDATE`).
3. **Deployment rollback failures**: if a migration fails during application startup, some pods might start while others crash, leaving the database schema and the Helm release state in an inconsistent "half-deployed" condition.

## Mental Model: The Helm Hooks Lifecycle

To solve this, we isolate schema migrations from the application deployment lifecycle. Helm Hooks trigger specific Kubernetes resources (usually a `Job`) at explicit points in the release lifecycle.

```text
       [ helm install / upgrade ]
                    │
                    ▼
       ┌────────────────────────┐
       │   Run Pre-Install /    │ <─── Triggers Migration Job
       │   Pre-Upgrade Hooks    │      (Halts chart deployment until done)
       └────────────────────────┘
                    │
                    ▼ (On Job Success)
       ┌────────────────────────┐
       │  Deploy Main Chart     │
       │   Resources (Pods)     │ <─── App pods start safely against
       └────────────────────────┘      an already-migrated database schema
                    │
                    ▼ (On Pod Success)
       ┌────────────────────────┐
       │  Run Post-Install /    │
       │   Post-Upgrade Hooks   │ <─── Optional notification/metrics hook
       └────────────────────────┘
```

By using a `pre-install` and `pre-upgrade` hook, Helm runs the migration Job first. It blocks the rollout of new application Pods until the database schema is successfully upgraded.

## The Architectural Solution: A Decoupled Migration Job

We create a dedicated, single-replica Kubernetes `Job` annotated as a Helm Hook. This Job runs before any other resource in the chart is updated. It connects to the database using high-privilege credentials stored securely in a Kubernetes Secret, while the application Deployment stays strictly bound to low-privilege credentials.

## Implementation: Helm Hook Configuration

Here is a complete, production-grade migration Job configured as a Helm `pre-install` and `pre-upgrade` hook.

### 1. The Migration Job Template (`templates/db-migration-job.yaml`)

```yaml
apiVersion: batch/v1
kind: Job
metadata:
  name: "{{ .Release.Name }}-db-migration"
  labels:
    app.kubernetes.io/managed-by: {{ .Release.Service | quote }}
    app.kubernetes.io/instance: {{ .Release.Name | quote }}
  annotations:
    # --- HELM HOOK DEFINITIONS ---
    # Trigger before resources are installed or upgraded
    "helm.sh/hook": pre-install,pre-upgrade

    # Weight determines execution order (lower numbers run first)
    "helm.sh/hook-weight": "-5"

    # Cleans up the job pod automatically after successful run
    "helm.sh/hook-delete-policy": hook-succeeded,before-hook-creation
spec:
  backoffLimit: 2
  activeDeadlineSeconds: 300
  template:
    metadata:
      name: "{{ .Release.Name }}-db-migration"
    spec:
      restartPolicy: OnFailure
      containers:
        - name: schema-migrator
          image: "migrate/migrate:v4.15.2"
          imagePullPolicy: IfNotPresent
          args:
            - "-path=/migrations"
            - "-database=$(DB_CONN_URL)"
            - "up"
          env:
            - name: DB_CONN_URL
              valueFrom:
                secretKeyRef:
                  name: "{{ .Release.Name }}-db-secret"
                  key: migration-admin-url
          volumeMounts:
            - name: migration-scripts
              mountPath: /migrations
      volumes:
        - name: migration-scripts
          configMap:
            name: "{{ .Release.Name }}-migration-files"
```

### 2. Deletion Policies and Hook Weights Explained

- **`helm.sh/hook-weight`**: when multiple hooks are defined, Helm runs them sequentially sorted by weight. A weight of `-5` ensures this Job executes before any hooks with a default weight of `0` or a positive weight.
- **`helm.sh/hook-delete-policy`**: standard Job resources are persistent. If left untouched, subsequent Helm upgrades fail because a Job with the same name already exists. The `hook-succeeded` and `before-hook-creation` policies guarantee successful migration Jobs are cleared, keeping the namespace tidy — and that a leftover failed Job from a previous attempt is deleted before the new hook Job is created.

## Verification and Rollback Guardrails

Execute a dry run to verify hook rendering before touching the cluster:

```bash
helm install billing-service ./charts/billing --dry-run --debug
```

Deploy the release. Watch how Helm waits for the Job's pod to complete with exit code `0` before starting the application rollout:

```bash
helm upgrade --install billing-service ./charts/billing --wait
```

If the migration Job fails, the hook execution fails, and Helm halts the upgrade *before* deploying a broken or schema-incompatible application image — preserving the uptime of the existing, still-running replicas. This is the key operational payoff: a bad migration script fails loudly and blocks the rollout instead of corrupting a live schema under concurrent pod restarts.

## Other Hook Points Worth Knowing

Beyond `pre-install`/`pre-upgrade`, Helm exposes hooks for the rest of the release lifecycle — useful for smoke tests and cleanup:

- `post-install` / `post-upgrade`: fire after all chart resources report ready — good for cache warming or a Slack notification.
- `pre-delete` / `post-delete`: fire around `helm uninstall` — good for graceful data export before a release is torn down.
- `pre-rollback` / `post-rollback`: fire around `helm rollback` — a safety net if you need to reverse-migrate schema changes when rolling back to an older release.
- `test`: run via `helm test`, not part of install/upgrade at all — a Job that asserts the release actually works, independent of the deploy pipeline.
