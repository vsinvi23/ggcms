# X.509 PQC Extensions: Encoding Hybrid Kyber/Dilithium Keys in ASN.1

## The Problem: The Certificate Size and Structure Paradox
The transition to Post-Quantum Cryptography (PQC) introduces a stark reality: Lattice-based algorithms like ML-DSA (formerly Dilithium) have massive public keys and signatures compared to ECDSA. 
Furthermore, the defense-in-depth strategy demands *hybrid cryptography*—packing both classical and PQC keys into standard PKI pipelines. But how do you stuff a 32-byte P-256 key alongside a 1312-byte ML-DSA-44 key into a legacy-compatible X.509 certificate without shattering existing ASN.1 parsers?

## The Solution: Composite Keys and Multiple OIDs
The IETF and PKI consortiums are defining standards for "Composite Keys." A composite key encapsulates two or more cryptographic keys within a single `SubjectPublicKeyInfo` (SPKI) field. The X.509 structure remains intact, but the OID (Object Identifier) indicates that the payload must be parsed as a sequence of keys.

### X.509 SubjectPublicKeyInfo (SPKI) Evolution

**Classical SPKI (ECDSA):**
```text
SubjectPublicKeyInfo ::= SEQUENCE {
    algorithm            AlgorithmIdentifier (id-ecPublicKey),
    subjectPublicKey     BIT STRING (04...[32 bytes])
}
```

**Composite SPKI (ECDSA P-256 + ML-DSA-44):**
```text
SubjectPublicKeyInfo ::= SEQUENCE {
    algorithm            AlgorithmIdentifier (id-composite-key),
    subjectPublicKey     BIT STRING {
        CompositePublicKey ::= SEQUENCE {
            SEQUENCE {
                algorithm        AlgorithmIdentifier (id-ecPublicKey, secp256r1),
                subjectPublicKey BIT STRING
            },
            SEQUENCE {
                algorithm        AlgorithmIdentifier (id-ml-dsa-44),
                subjectPublicKey BIT STRING
            }
        }
    }
}
```

### ASN.1 Decoding using Python
Robust parsing of composite certificates requires handling the nested ASN.1 structures. Below is an implementation using Python's `asn1crypto` to decode a hypothetical composite public key structure.

```python
from asn1crypto import x509, core, keys

# Hypothetical OID for P256 + ML-DSA-44 Composite
COMPOSITE_OID = '1.3.6.1.4.1.XXXX.1.1' 

class CompositePublicKey(core.SequenceOf):
    _child_spec = keys.PublicKeyInfo

def parse_composite_spki(der_bytes: bytes):
    """
    Parses a DER encoded SubjectPublicKeyInfo containing a composite key.
    """
    spki = keys.PublicKeyInfo.load(der_bytes)
    
    algo_oid = spki['algorithm']['algorithm'].native
    if algo_oid != COMPOSITE_OID:
        raise ValueError(f"Expected Composite OID, got {algo_oid}")
        
    print("[+] Detected Composite Key Structure")
    
    # Extract the nested bit string
    nested_bytes = spki['public_key'].native
    
    # Parse the inner sequence of PublicKeyInfo
    composite_keys = CompositePublicKey.load(nested_bytes)
    
    for idx, key_info in enumerate(composite_keys):
        inner_algo = key_info['algorithm']['algorithm'].native
        key_size = len(key_info['public_key'].native)
        print(f"  Key {idx + 1}:")
        print(f"    Algorithm OID: {inner_algo}")
        print(f"    Key Length: {key_size} bytes")

# Example Output:
# [+] Detected Composite Key Structure
#   Key 1:
#     Algorithm OID: 1.2.840.10045.2.1 (ecPublicKey)
#     Key Length: 65 bytes (Uncompressed)
#   Key 2:
#     Algorithm OID: 2.16.840.1.101.3.4.3.17 (ml-dsa-44)
#     Key Length: 1312 bytes
```

### Alternative: X.509 Non-Critical Extensions
Instead of modifying the SPKI directly (which breaks legacy clients that don't understand the `id-composite-key` OID), another approach uses standard X.509v3 Extensions. 

The certificate's primary SPKI holds the classical ECDSA key (maintaining backward compatibility). The ML-DSA public key is embedded in a custom, *non-critical* extension (e.g., `id-pqc-alt-pubkey`). 

```text
Certificate
  |- tbsCertificate
     |- subjectPublicKeyInfo (ECDSA P-256)
     |- extensions
        |- Extension (id-pqc-alt-pubkey, critical=FALSE)
           |- OCTET STRING (ML-DSA-44 Public Key)
        |- Extension (id-pqc-alt-signature, critical=FALSE)
           |- OCTET STRING (ML-DSA-44 Signature over TBS)
```

**Pros & Cons:**
*   **Composite Keys:** Ensures both algorithms are tied mathematically to the identity. Fails completely on legacy parsers.
*   **Extensions:** Gracefully degrades on legacy systems. Vulnerable to extension-stripping attacks if the client doesn't strictly mandate the presence of the PQC extension.

Architects designing PKI migrations must choose between strict enforcement (Composite) and phased rollout (Extensions) based on their fleet's ASN.1 parser maturity.