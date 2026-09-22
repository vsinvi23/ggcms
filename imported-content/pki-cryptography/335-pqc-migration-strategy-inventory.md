# PQC Migration: Designing a Cryptographic Bill of Materials (CBOM)

## The Problem: The Invisible Cryptographic Surface
Transitioning an enterprise to Post-Quantum Cryptography (PQC) is not primarily a mathematical problem; it is a massive software engineering and discovery problem. You cannot migrate what you cannot see. 

In a modern microservices architecture, classical cryptography (RSA, ECDSA, AES, SHA-2) is heavily fragmented. It is embedded in TLS termination proxies, hardcoded in legacy Java keystores, baked into CI/CD pipeline signing scripts, and statically compiled into Go binaries. If an organization simply mandates "upgrade to ML-KEM," engineering teams will fail because they lack an inventory of their cryptographic dependencies.

## The Solution: The CBOM (Cryptographic Bill of Materials)
Inspired by the Software Bill of Materials (SBOM) used for supply chain security, the Cryptographic Bill of Materials (CBOM) is a formalized, machine-readable inventory of all cryptographic assets within an application, repository, or infrastructure.

A robust CBOM tracks:
1.  **Algorithm Details:** OIDs, key lengths, curves, and padding schemes (e.g., `RSA-OAEP-2048`, `secp256r1`).
2.  **Usage Context:** What is the crypto doing? (e.g., Data at Rest, TLS KEM, JWT signing).
3.  **Library/Provider:** Which library implements it? (e.g., OpenSSL 3.0.2, BouncyCastle, AWS KMS).
4.  **Quantum Readiness:** Is the asset vulnerable to Shor's or Grover's algorithms?

### Standardizing the CBOM: CycloneDX
The OWASP CycloneDX format recently introduced native support for cryptographic inventories (CycloneDX v1.5+). It defines XML/JSON schemas specifically for capturing cryptographic agility.

**Example: CycloneDX JSON CBOM snippet indicating a vulnerable ECDH usage**
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

### Building the CBOM Pipeline
Generating a CBOM cannot be manual. It requires static analysis and runtime tracing.

#### 1. Static Analysis (SAST for Crypto)
Code scanners parse Abstract Syntax Trees (AST) looking for cryptographic API invocations. 
For example, a scanner targeting Python's `cryptography` library will flag the following:

```python
from cryptography.hazmat.primitives.asymmetric import rsa

# Scanner detects: RSA Key Generation
# Extract: key_size=2048
# CBOM Entry: primitive=public-key, algorithm=RSA, size=2048, status=vulnerable
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048, 
)
```

#### 2. Network Discovery
Passive network scanners (e.g., Zeek, Wireshark) analyze TLS ClientHello and ServerHello packets to map cryptographic negotiation on the wire. This catches "black box" appliances that cannot be statically analyzed.

```text
# Conceptual Zeek extraction mapping to CBOM
Connection: 10.0.0.5 -> 10.0.0.10
TLS Version: 1.2
Cipher Suite: TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256
Analysis: 
  - KEM: ECDHE (secp256r1) -> VULNERABLE (Shor)
  - Auth: RSA (2048) -> VULNERABLE (Shor)
  - Sym: AES-128 -> MARGINAL (Grover)
```

### Executing the Migration
Once the CBOM is generated across the enterprise, the PQC migration becomes a queryable database problem.

*   **Query 1:** Find all systems using RSA keys < 3072 bits (Immediate deprecation).
*   **Query 2:** Identify all Go microservices using `crypto/tls` (Target for Go 1.23+ upgrade to enable X25519Kyber768Draft00).
*   **Query 3:** Locate HSM-backed keys (Requires vendor roadmap alignment for ML-DSA firmware updates).

Without a CBOM, PQC migration is guesswork. With a CBOM, it is a deterministic engineering project.