# Kubernetes Secrets: What Are You Actually Protecting?

### The Illusion of Security

Let's look at a standard Kubernetes Secret:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: db-credentials
type: Opaque
data:
  password: cGFzc3dvcmQxMjM=
```

A common misconception among newcomers to Kubernetes is that `cGFzc3dvcmQxMjM=` is encrypted. It is not. It is merely Base64 encoded. Anyone who can read this yaml file can run `echo "cGFzc3dvcmQxMjM=" | base64 -d` and retrieve the plaintext: `password123`.

The Base64 encoding exists purely to allow arbitrary binary data to be safely transmitted over JSON/YAML REST APIs. It provides zero cryptographic security.

### Where is the Threat?

To understand how to secure Kubernetes Secrets, we must first define the threat model. Where can secrets be leaked?

1. **At Rest in Git:** If you commit the YAML file above into a Git repository, anyone with repository access has the password.
2. **In Transit:** When the API server sends the Secret to the kubelet.
3. **At Rest in etcd:** The API server stores all cluster state, including Secrets, in the `etcd` key-value store.
4. **At Rest on the Node:** When the kubelet mounts the Secret into a Pod.

### Securing Secrets in Git (GitOps)

You should never commit plaintext Secrets to source control. To follow GitOps practices, you must encrypt the secrets before pushing.

**Solution: Sealed Secrets (Bitnami) or SOPS (Mozilla).**
These tools provide a public key to encrypt your YAML files locally. You commit a `SealedSecret` to Git. The SealedSecret controller running in your cluster possesses the private key. When it detects a `SealedSecret`, it decrypts it and generates a native Kubernetes `Secret`.

Alternatively, use external secret managers like **HashiCorp Vault** or **AWS Secrets Manager**, combined with the **External Secrets Operator** which pulls values dynamically and injects them into the cluster.

### Securing Secrets in etcd (Encryption at Rest)

By default, the Kubernetes API server stores secrets in `etcd` in plaintext (Base64). If an attacker compromises the underlying VMs and reads the etcd database files on disk, they obtain all secrets.

**Solution: Enable etcd Encryption at Rest.**
You must configure the API server with an `EncryptionConfiguration` file.

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - aescbc:
          keys:
            - name: key1
              secret: <32-byte-base64-key>
      - identity: {} # Fallback to plaintext if decryption fails
```

For production, instead of storing a local AES key (which just moves the problem), use a **KMS Provider** (Key Management Service). The API server delegates the encryption of the Data Encryption Key (DEK) to AWS KMS, GCP KMS, or Azure Key Vault.

### Securing Secrets on the Node

When a Pod requests a Secret via a volume mount, the kubelet creates a `tmpfs` (RAM disk) and writes the Secret there. 

```yaml
  volumes:
  - name: secret-volume
    secret:
      secretName: db-credentials
```

This prevents the Secret from being persisted to the Node's physical hard drive. When the Pod is deleted, the RAM disk is destroyed. 

### Securing Secrets in the API (RBAC)

Ultimately, the most common vector for Secret exfiltration is over-permissive RBAC. If a developer's Service Account is granted `get` on `secrets` across the namespace, a compromised Pod can simply query the API server and request all credentials.

**Solution:** Granular RBAC. Never use wildcards for resources. If a Pod only needs `db-credentials`, do not grant it access to read all Secrets.
