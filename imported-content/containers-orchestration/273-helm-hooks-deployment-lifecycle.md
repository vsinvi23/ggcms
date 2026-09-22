# Advanced Helm: Hooks for Database Migrations in Deployment Lifecycles

## The Problem: The Startup Migration Anti-Pattern
In microservice architectures, applications often manage their own database schemas. A common, yet dangerous, anti-pattern is executing database migrations (like Liquibase, Flyway, or custom scripts) during the application's startup phase (e.g., in an `initContainer` or inside the main container entrypoint). 

While simple, this pattern introduces severe operational risks:
1. **Concurrent Race Conditions**: If you scale your application to 10 replicas, 10 separate pods will attempt to execute the same schema modifications simultaneously. This can lead to database table locks, transactional deadlocks, or schema corruption.
2. **Privilege Escalation**: Running migrations inside the application container requires the application to connect with high-privileged DDL credentials (e.g., `CREATE`, `ALTER`). For security, application pods should only possess low-privileged DML rights (`SELECT`, `INSERT`, `UPDATE`).
3. **Deployment Rollback Failures**: If a migration fails during application startup, some pods might start while others crash, leaving the database schema and Helm release state in an inconsistent "half-deployed" state.

## Mental Model: Helm Hooks Lifecycle
To solve this, we must isolate schema migrations from the application deployment lifecycle. Helm Hooks allow you to trigger specific Kubernetes resources (usually a `Job`) at explicit points in the release lifecycle.

```
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

By utilizing a `pre-install` and `pre-upgrade` Hook, Helm runs your migration Job first. It blocks the rollout of your new application Pods until the database schema is successfully upgraded.

## The Architectural Solution: Decoupled Migration Jobs
We create a dedicated, single-replica Kubernetes `Job` annotated as a Helm Hook. This Job runs before any other resource in the chart is updated. It connects to the database using high-privilege credentials stored securely in a Kubernetes Secret, while the application deployment remains strictly bound to low-privilege credentials.

## Implementation: Helm Hook Configuration

Here is a complete, production-grade migration Job configured as a Helm pre-install and pre-upgrade hook.

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
- **`helm.sh/hook-weight`**: When multiple hooks are defined, Helm runs them sequentially sorted by weight. A weight of `-5` ensures this Job executes before any hooks with a default weight of `0` or positive weights.
- **`helm.sh/hook-delete-policy`**: Standard Job resources are persistent. If left untouched, subsequent Helm upgrades will fail because a Job with the same name already exists. The `hook-succeeded` and `before-hook-creation` policies guarantee that successful migration Jobs are cleared, keeping the namespace tidy.

## Verification and Rollback Guardrails
Execute a dry-run release to verify hook validation:
```bash
helm install billing-service ./charts/billing --dry-run --debug
```

Deploy the release. Watch how Helm waits for the Job's pod to complete with exit code `0` before starting the Application Rollout:
```bash
helm upgrade --install billing-service ./charts/billing --wait
```

If the migration Job fails, the hook execution fails, and Helm halts the upgrade *before* deploying your broken or incompatible application image, preserving the uptime of your existing replicas.
