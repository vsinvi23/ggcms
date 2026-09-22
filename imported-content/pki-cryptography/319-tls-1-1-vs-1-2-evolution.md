# The Evolution of TLS: Why TLS 1.0 and 1.1 Died (BEAST, POODLE) and TLS 1.2 Survived

**Problem:** Legacy TLS versions (1.0 and 1.1) relied on cryptographic primitives and cipher constructions that were fundamentally flawed, exposing sensitive plaintext to active network attackers through side-channel leaks.

### Structural Vulnerabilities in Legacy TLS

TLS 1.0 and 1.1 primarily failed due to their reliance on fragile cryptographic paradigms: Cipher Block Chaining (CBC) mode with predictable Initialization Vectors (IVs) and the flawed MAC-then-Encrypt paradigm.

#### The BEAST Attack (TLS 1.0)
The Browser Exploit Against SSL/TLS (BEAST) targeted a design flaw in TLS 1.0 where CBC mode used chained Initialization Vectors (IVs). The IV for a given record was simply the last ciphertext block of the previous record.

```text
+----------------+       +----------------+
| Record 1 (C_1) | ----> | IV for Record 2|
+----------------+       +----------------+
```

Because the attacker observes $C_1$, they know the IV for the next block before the victim encrypts it. If the attacker can trick the victim's browser into encrypting an attacker-chosen plaintext alongside a target secret (like a session cookie), they can systematically guess the secret byte-by-byte. 

**Mathematical Exploit (Simplified):**
$C_i = E_k(P_i \oplus IV_i)$
If IV is known, attacker chooses $P_i' = P_{guess} \oplus IV_i \oplus IV_{target}$.
If $C_i' == C_{target}$, the guess is correct.

TLS 1.1 mitigated this by mandating explicit, randomized IVs for every record, nullifying BEAST. However, TLS 1.1 still utilized MAC-then-Encrypt.

#### The POODLE Attack (TLS 1.0, SSL 3.0, and CBC flaws)
The Padding Oracle On Downgraded Legacy Encryption (POODLE) attack exploited the interaction between block cipher padding and the MAC-then-Encrypt construction. 

In MAC-then-Encrypt, the payload is concatenated with its MAC, and then padded to a multiple of the block size.
```text
Plaintext Structure (Pre-Encryption):
[ Data (n bytes) | MAC (m bytes) | Padding (p bytes) | Pad Length (1 byte) ]
```

When decrypting, the receiver first decrypts, strips the padding, and *then* verifies the MAC. If the padding is invalid, the receiver terminates the connection (padding error). If the padding is valid but the MAC fails, it terminates with a MAC error. 

By observing the timing or distinct error messages, an attacker uses the server as a "padding oracle." By repeatedly modifying ciphertext blocks and forcing decryption attempts, the attacker determines if the manipulated padding was valid, eventually decrypting the entire ciphertext without the key.

### The Survival of TLS 1.2

TLS 1.2 survived because it introduced Authenticated Encryption with Associated Data (AEAD) ciphers, fundamentally shifting the paradigm away from vulnerable CBC modes.

**Key Advancements in TLS 1.2:**
1. **AEAD and GCM:** Introduction of Galois/Counter Mode (GCM). AEAD binds encryption and authentication into a single, atomic operation (Encrypt-and-MAC), preventing padding oracle attacks completely because ciphertexts are authenticated *before* any decryption or padding removal occurs.
2. **SHA-256 for PRF:** Replaced the legacy MD5/SHA-1 combinations used in the pseudorandom function (PRF) with modern SHA-256, strengthening the key derivation process.
3. **Explicit IVs (Inherited from 1.1):** Maintained explicit IVs to prevent BEAST-style chaining attacks.

```c
// Example: Modern TLS 1.2 AEAD decryption flow
int decrypt_aead(const uint8_t *ciphertext, size_t clen,
                 const uint8_t *aad, size_t alen,
                 const uint8_t *iv,
                 uint8_t *plaintext) {
    // 1. Verify authentication tag FIRST.
    if (!verify_tag(ciphertext, clen, aad, alen, iv)) {
        return ERR_DECRYPT_FAILED; // Generic error, no padding oracle
    }
    
    // 2. Decrypt ONLY if tag is valid.
    perform_ctr_decryption(ciphertext, clen, iv, plaintext);
    return SUCCESS;
}
```

By deprecating TLS 1.0 and 1.1, the industry eradicated the attack surface presented by MAC-then-Encrypt and predictable CBC modes, establishing TLS 1.2 (configured strictly with AEAD ciphers) as the baseline for secure transport.