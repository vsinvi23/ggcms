# Kubernetes Secrets: Enabling etcd Encryption-at-Rest with KMS

## The Problem: The Base64 Security Illusion
A dangerous misconception among cloud developers is that Kubernetes Secrets are inherently secure. In reality, Kubernetes Secrets are stored in `etcd` as plain text encoded in Base64. Base64 is a serialization format, not encryption. Anyone with access to the cluster's `etcd` database, node file system backups, or master node backups can easily decode and retrieve sensitive API keys, database credentials, and certificates:

```bash
# Deceptively easy retrieval of a secret from raw etcd dump or API
echo "bXktc3VwZXItc2VjcmV0LWtleQ==" | base64 --decode
# Output: my-super-secret-key
```

If an attacker gains administrative access to the control plane, or compromises an unencrypted backup, your entire secrets infrastructure is compromised. To satisfy regulatory frameworks (like SOC2, HIPAA, and PCI-DSS), you must implement strong encryption-at-rest for your cluster's database layer.

## Mental Model: Envelope Encryption with KMS
To secure secrets without degrading control plane performance, Kubernetes employs **Envelope Encryption**. Instead of sending every secret directly to an external Key Management Service (KMS) which introduces severe latency, Kubernetes handles encryption locally using a dynamic Data Encryption Key (DEK). The DEK is then encrypted using a Key Encryption Key (KEK) managed by an external KMS (such as AWS KMS, GCP Cloud KMS, or HashiCorp Vault).

```
                     [ Kubernetes API Server ]
                                │
                 Generates DEK  │
                 and encrypts   │  (1) Encrypts DEK
                    Secret      │   with KEK
                                v
               [ External Key Management Service (KMS) ]
                                │
                                │  (2) Returns Storable
                                │   Encrypted DEK
                                v
                     [ Kubernetes API Server ]
                                │
                    Saves to    │  (3) Stores:
                      etcd      │   [ Encrypted DEK ] + [ Encrypted Secret ]
                                v
                            [ etcd ]
```

When writing a secret, the API server encrypts the data with a local DEK, requests the KMS provider plugin to encrypt the DEK with the remote KEK, and writes the encrypted payload to `etcd`.

## The Architectural Solution: EncryptionConfiguration
To enable envelope encryption, we deploy a local KMS plugin on our master nodes and configure the `kube-apiserver` using an `EncryptionConfiguration` manifest. This instructs the API server to route secret read/write operations through the KMS provider before persisting them to `etcd`.

## Implementation: Setting Up KMS v2 Encryption

Below is the step-by-step configuration to activate AWS KMS (v2) envelope encryption on your Kubernetes API Server.

### Step 1: Define the EncryptionConfiguration Manifest
Save this file as `/etc/kubernetes/encryption/config.yaml` on your master nodes:

```yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - kms:
          # Use KMS v2 for improved performance and connection multiplexing
          apiVersion: v2
          name: aws-kms-provider
          endpoint: unix:///var/run/kms-provider/kms.sock
          timeout: 3s
      - identity: {} # Fallback provider to allow reading unencrypted old secrets
```

The `identity: {}` fallback provider is critical: it ensures that the API server can still read existing unencrypted secrets. As these secrets are updated, they will be automatically rewritten using the active `kms` provider.

### Step 2: Configure the kube-apiserver
Update your control-plane's `/etc/kubernetes/manifests/kube-apiserver.yaml` static pod configuration. Add the following command-line argument:

```yaml
spec:
  containers:
  - command:
    - kube-apiserver
    - --encryption-provider-config=/etc/kubernetes/encryption/config.yaml
    # Mount the KMS socket directory
    volumeMounts:
    - name: encryption-config
      mountPath: /etc/kubernetes/encryption
      readOnly: true
    - name: kms-socket
      mountPath: /var/run/kms-provider
  volumes:
  - name: encryption-config
    hostPath:
      path: /etc/kubernetes/encryption
      type: DirectoryOrCreate
  - name: kms-socket
    hostPath:
      path: /var/run/kms-provider
      type: DirectoryOrCreate
```

The API server will restart automatically once the file is modified.

## Verification: Confirming etcd Encryption
To verify that new secrets are stored in encrypted format, write a test secret to your cluster:

```bash
kubectl create secret generic production-db-key --from-literal=password=SuperSecretPass123
```

Now, query `etcd` directly using `etcdctl` to inspect how the secret is saved in raw storage:
```bash
# Execute etcd query on control plane node
ETCDCTL_API=3 etcdctl \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/secrets/default/production-db-key
```

If KMS encryption is active, the output will start with the prefix `k8s:enc:kms:v2:aws-kms-provider`, followed by binary garbage representing the encrypted payload. The secret is now fully secure at rest.
