---
title: "Kubernetes Secrets Encryption at Rest with KMS Envelope Encryption"
description: "Why Kubernetes Secrets stored as Base64 in etcd are not actually encrypted, how envelope encryption with an external KMS provider fixes that, and the exact EncryptionConfiguration and kube-apiserver changes needed to enable it."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "kubernetes-secrets"
  - "encryption-at-rest"
  - "kms"
  - "etcd-security"
  - "envelope-encryption"
---

# Kubernetes Secrets Encryption at Rest with KMS Envelope Encryption

## The Problem: Base64 Is Not Encryption

A dangerous, common misconception: Kubernetes `Secret` objects are "secure" simply because they exist as a distinct resource type. In reality, by default, secret data is stored in `etcd` encoded as **Base64** — a reversible serialization format, not a cipher.

```bash
echo "bXktc3VwZXItc2VjcmV0LWtleQ==" | base64 --decode
# my-super-secret-key
```

Anyone with read access to a raw `etcd` snapshot, an unencrypted `etcd` backup, or the control-plane node's filesystem can decode every secret in the cluster — API keys, database credentials, TLS private keys — with a single shell command. Compliance frameworks that require encryption at rest for sensitive data (SOC 2, HIPAA, PCI-DSS) are not satisfied by Base64 encoding; this is exactly the gap `EncryptionConfiguration` closes.

## The Solution: Envelope Encryption via an External KMS

Sending every secret directly to an external Key Management Service on every read/write would add unacceptable latency to the control plane. Kubernetes instead uses **envelope encryption**: a locally-generated Data Encryption Key (DEK) encrypts the actual secret content, and only the much smaller DEK itself is sent to the external KMS to be wrapped by a Key Encryption Key (KEK) that never leaves the KMS.

```text
                     [ Kubernetes API Server ]
                                |
                Generates DEK   |
                encrypts secret |  (1) sends DEK to KMS
                    locally     |      to be wrapped
                                v
               [ External KMS (AWS KMS / GCP KMS / Vault) ]
                                |
                                |  (2) returns encrypted
                                |      ("wrapped") DEK
                                v
                     [ Kubernetes API Server ]
                                |
                    writes      |  (3) stores:
                   to etcd      |      [ wrapped DEK ] + [ DEK-encrypted secret ]
                                v
                            [ etcd ]
```

Only the KMS ever holds the KEK; `etcd` stores nothing that's directly decryptable without a live round-trip to the KMS to unwrap the DEK first — an attacker with only an `etcd` snapshot gains nothing.

## Step 1: Define the EncryptionConfiguration

This manifest tells the API server which resources to encrypt and which provider chain to use, in priority order:

```yaml
# /etc/kubernetes/encryption/config.yaml
apiVersion: apiserver.config.k8s.io/v1
kind: EncryptionConfiguration
resources:
  - resources:
      - secrets
    providers:
      - kms:
          apiVersion: v2      # KMS v2: better performance, connection multiplexing
          name: aws-kms-provider
          endpoint: unix:///var/run/kms-provider/kms.sock
          timeout: 3s
      - identity: {}          # Fallback: read pre-existing unencrypted secrets
```

The `identity: {}` entry is not optional in practice — without it, any secret written before encryption was enabled becomes unreadable the moment the KMS provider is added, because the API server would have no provider capable of decoding its (unencrypted) on-disk form. With `identity: {}` present as a fallback, existing secrets remain readable and are transparently re-encrypted with the `kms` provider the next time they're written.

## Step 2: Point kube-apiserver at the Configuration

Update the static pod manifest for `kube-apiserver` (typically `/etc/kubernetes/manifests/kube-apiserver.yaml`):

```yaml
spec:
  containers:
  - command:
    - kube-apiserver
    - --encryption-provider-config=/etc/kubernetes/encryption/config.yaml
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

Because this is a static pod manifest, the kubelet on the control-plane node detects the file change and restarts `kube-apiserver` automatically — no separate rollout step is required. This also means every control-plane node needs the KMS provider plugin running locally and listening on that same Unix socket path.

## Step 3: Verify Secrets Are Actually Encrypted

Create a test secret:

```bash
kubectl create secret generic production-db-key --from-literal=password=SuperSecretPass123
```

Then bypass the Kubernetes API entirely and inspect the raw `etcd` record directly — this is the only way to confirm encryption is actually happening on disk, since the Kubernetes API always transparently decrypts secrets for authorized callers:

```bash
ETCDCTL_API=3 etcdctl \
  --cacert=/etc/kubernetes/pki/etcd/ca.crt \
  --cert=/etc/kubernetes/pki/etcd/server.crt \
  --key=/etc/kubernetes/pki/etcd/server.key \
  get /registry/secrets/default/production-db-key
```

A correctly encrypted secret starts with a recognizable prefix — `k8s:enc:kms:v2:aws-kms-provider` — followed by opaque binary ciphertext. If instead you see the Base64-decodable plaintext structure of a Kubernetes object, the encryption provider isn't active for that resource yet (check `--encryption-provider-config` is actually being read, and that this particular secret has been re-written since the config took effect — pre-existing secrets are only re-encrypted on next write, not automatically).

## Operational Notes

- **Existing secrets aren't retroactively encrypted.** Enabling `EncryptionConfiguration` only encrypts secrets going forward. To re-encrypt everything already in `etcd`, force a rewrite: `kubectl get secrets --all-namespaces -o json | kubectl replace -f -` (or use `kube-apiserver`'s documented storage migration tooling for large clusters).
- **Losing the KMS means losing your secrets.** If the external KMS becomes permanently unavailable and you have no backup of the KEK, encrypted secrets are unrecoverable — treat KMS availability and key backup with the same rigor as your `etcd` backup strategy itself.
- **KMS v2 vs v1.** Prefer `apiVersion: v2` — it multiplexes a single gRPC connection to the KMS plugin instead of opening one per request, which matters materially at scale.

## Key Takeaways

- Kubernetes Secrets are Base64-encoded in `etcd` by default, not encrypted — Base64 is trivially reversible by anyone with read access to a raw `etcd` dump or backup.
- Envelope encryption (a locally-generated DEK wrapped by an externally-held KEK) avoids sending every secret to the KMS while keeping the KEK itself outside the cluster's blast radius.
- Always keep `identity: {}` as a fallback provider in `EncryptionConfiguration` so pre-existing unencrypted secrets remain readable and get transparently re-encrypted on next write.
- Verify encryption by reading the raw `etcd` record directly with `etcdctl`, not via the Kubernetes API — the API always decrypts transparently regardless of whether encryption is actually active.
