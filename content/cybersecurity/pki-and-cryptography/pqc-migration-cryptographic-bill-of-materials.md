---
title: "PQC Migration: Building a Cryptographic Bill of Materials (CBOM)"
description: "Why post-quantum migration is fundamentally a discovery problem before it's a mathematical one, how CycloneDX's CBOM schema inventories cryptographic assets across an enterprise, and how to build the static-analysis and network-discovery pipeline that populates it."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "post-quantum-cryptography"
  - "cbom"
  - "cryptographic-agility"
  - "cyclonedx"
  - "crypto-inventory"
  - "sbom"
---

# PQC Migration: Building a Cryptographic Bill of Materials (CBOM)

## The Problem: The Invisible Cryptographic Surface

Migrating an enterprise to Post-Quantum Cryptography is not primarily a mathematical problem — it is a massive software engineering discovery problem. You cannot migrate cryptography you cannot see.

In a modern microservices architecture, classical cryptography (RSA, ECDSA, AES, SHA-2) is scattered across dozens of layers: TLS termination at the load balancer, hardcoded key sizes in a legacy Java keystore nobody has touched in five years, signing logic baked into a CI/CD pipeline script, and statically compiled crypto calls inside Go binaries that were built once and never revisited. If an organization simply mandates "upgrade to ML-KEM," engineering teams have no starting point — they don't have an inventory of where cryptography actually lives.

## The Solution: The Cryptographic Bill of Materials

Modeled directly on the Software Bill of Materials (SBOM) used for supply-chain security, a **Cryptographic Bill of Materials (CBOM)** is a formalized, machine-readable inventory of every cryptographic asset in an application, repository, or infrastructure footprint.

A useful CBOM tracks, per asset:

1. **Algorithm details** — OIDs, key lengths, curves, padding schemes (e.g. `RSA-OAEP-2048`, `secp256r1`).
2. **Usage context** — what the crypto actually protects (data at rest, TLS key exchange, JWT signing, code signing).
3. **Library/provider** — the implementation supplying it (OpenSSL 3.0.2, BouncyCastle, a cloud KMS).
4. **Quantum readiness** — is this asset vulnerable to Shor's algorithm (asymmetric), only weakened by Grover's algorithm (symmetric/hash), or already migrated?

### Standardizing the Format: CycloneDX

OWASP's CycloneDX format added native cryptographic-inventory support starting at v1.5, with XML/JSON schemas built specifically for capturing this kind of asset.

```json
{
  "bomFormat": "CycloneDX",
  "specVersion": "1.5",
  "components": [
    {
      "type": "cryptographic-asset",
      "name": "Legacy TLS Key Exchange",
      "cryptoProperties": {
        "assetType": "algorithm",
        "algorithmProperties": {
          "primitive": "public-key",
          "executionEnvironment": "software-library",
          "curve": "secp256r1",
          "cryptoFunctions": ["key-agreement"]
        }
      },
      "properties": [
        {
          "name": "quantum-status",
          "value": "vulnerable-shor"
        }
      ]
    }
  ]
}
```

## Building the CBOM Pipeline

Generating a CBOM cannot be a manual spreadsheet exercise at enterprise scale — it needs both static source analysis and passive runtime/network discovery, because neither alone covers the full surface.

### 1. Static Analysis (SAST for Crypto)

Code scanners walk the Abstract Syntax Tree of each source file looking for cryptographic API invocations, extracting the parameters that matter for quantum-readiness assessment.

```python
from cryptography.hazmat.primitives.asymmetric import rsa

# Scanner detects: RSA key generation call
# Extracted: key_size=2048
# CBOM entry: primitive=public-key, algorithm=RSA, size=2048, status=vulnerable-shor
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
)
```

A real scanner needs signatures for every major crypto API surface an organization uses — Python's `cryptography` and `pycryptodome`, Java's `java.security`/BouncyCastle, Go's `crypto/*` and `golang.org/x/crypto`, OpenSSL's C API, and cloud KMS SDK calls — since each ecosystem exposes algorithm/key-size parameters differently.

### 2. Network Discovery

Static analysis misses black-box appliances: hardware load balancers, legacy firewalls, and vendor devices whose source isn't available. Passive network scanners (Zeek, or a Wireshark-based pipeline) fill this gap by parsing TLS `ClientHello`/`ServerHello` exchanges directly off the wire to see what cipher suites are actually negotiated in production.

```text
# Conceptual Zeek extraction mapping to CBOM
Connection: 10.0.0.5 -> 10.0.0.10
TLS Version: 1.2
Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
Analysis:
  - KEM:  ECDHE (secp256r1)  -> VULNERABLE (Shor)
  - Auth: RSA (2048)         -> VULNERABLE (Shor)
  - Sym:  AES-128            -> MARGINAL (Grover, halves to 64-bit effective strength)
```

This catches exactly the systems that static analysis can never reach, and it's the only reliable way to confirm what's *actually* negotiated at runtime versus what a config file merely allows.

## Executing the Migration

Once the CBOM exists as a queryable dataset across the enterprise — not a point-in-time report, but a continuously refreshed inventory fed by both pipelines above — the PQC migration stops being guesswork and becomes a deterministic engineering backlog:

- **Query 1:** find all systems using RSA keys smaller than 3072 bits → immediate deprecation candidates.
- **Query 2:** identify all Go microservices calling `crypto/tls` directly → target list for upgrading to a Go toolchain version with hybrid X25519Kyber768 support enabled.
- **Query 3:** locate every HSM-backed key → requires vendor firmware roadmap alignment before ML-DSA support lands, since HSM upgrades are typically the longest lead-time item in the whole migration.

Without a CBOM, PQC migration planning is guesswork built on tribal knowledge of "where the crypto probably is." With a CBOM, it's a project plan with a concrete, queryable scope.
