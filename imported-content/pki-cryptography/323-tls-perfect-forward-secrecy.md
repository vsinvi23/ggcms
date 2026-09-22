# Perfect Forward Secrecy (PFS): Why Static RSA Key Exchange was Banned in TLS 1.3

**Problem:** In legacy TLS configurations using static RSA key exchange, a server's private key acts as a master skeleton key. If an adversary records years of encrypted network traffic and later compromises the server's private key, they can retroactively decrypt every single historical session.

### The Flaw of Static RSA Key Exchange

In TLS 1.2 and earlier, cipher suites like `TLS_RSA_WITH_AES_256_GCM_SHA384` utilized the server's RSA keypair for both authentication *and* key exchange.

**The Static RSA Handshake:**
1. The server sends its RSA public key (via its certificate) to the client.
2. The client generates a random 48-byte "premaster secret."
3. The client encrypts this premaster secret using the server's RSA public key and sends it to the server.
4. The server decrypts it using its RSA private key.
5. Both derive symmetric session keys from this premaster secret.

**The Vulnerability:**
The encrypted premaster secret traverses the network. An intelligence agency or malicious actor can record this ciphertext. If, five years later, the server is breached (or subject to a court order) and the RSA private key is acquired, the attacker simply:
1. Uses the private key to decrypt the recorded premaster secret.
2. Derives the symmetric session keys.
3. Decrypts the entire historical session.

### Perfect Forward Secrecy (PFS) via Ephemeral Diffie-Hellman

Perfect Forward Secrecy ensures that the compromise of long-term long-lived cryptographic keys (like the server's certificate private key) does not compromise past session keys.

This is achieved by decoupling authentication from key exchange. Instead of encrypting the premaster secret, TLS utilizes Ephemeral Elliptic Curve Diffie-Hellman (ECDHE).

**The ECDHE Handshake (PFS Achieved):**
1. **Ephemeral Key Generation:** The client and server each generate a *temporary, single-use* elliptic curve keypair for the connection.
2. **Exchange:** They exchange their ephemeral public keys.
3. **Shared Secret:** Using Diffie-Hellman mathematics, both compute the same shared secret (premaster secret) without it ever crossing the network.
4. **Authentication:** The server uses its long-term RSA or ECDSA private key *only* to digitally sign its ephemeral public key, proving to the client that the key exchange is not being MitM'd.
5. **Destruction:** Once the session keys are derived, the ephemeral private keys are permanently deleted from RAM.

```text
Client                              Server
(Generates Temp Key c, C)           (Generates Temp Key s, S)

          <-- Server Public Key (S) + Digital Signature (using long-term key)
Client Public Key (C) -->

Client computes:                    Server computes:
Shared Secret = c * S               Shared Secret = s * C
(Note: c * S == s * C in Elliptic Curve Math)
```

Because the shared secret was never transmitted, and the ephemeral private keys (`c` and `s`) are destroyed immediately, a future compromise of the server's long-term key only allows the attacker to forge *future* signatures; they cannot derive past shared secrets.

### The TLS 1.3 Mandate

When the IETF drafted TLS 1.3 (RFC 8446), the primary goal was drastic reduction of attack surface. Because static RSA key exchange represents a catastrophic risk to long-term data confidentiality, it was entirely purged from the protocol.

TLS 1.3 strictly mandates PFS. It only supports ephemeral key exchanges (DHE or ECDHE). 

```python
// Conceptual representation of PFS failure vs success

def static_rsa_decrypt_history(recorded_ciphertext, stolen_private_key):
    premaster = rsa_decrypt(recorded_ciphertext.key_exchange, stolen_private_key)
    return derive_and_decrypt(premaster, recorded_ciphertext.data) # SUCCESS

def pfs_decrypt_history(recorded_ciphertext, stolen_private_key):
    # The stolen key can only verify signatures. 
    # It cannot derive the ephemeral secret because the ephemeral 
    # private keys were wiped from server RAM years ago.
    raise CryptographicError("Cannot compute shared secret without ephemeral keys.")
```

By eradicating static key exchange, TLS 1.3 ensures that today's encrypted data cannot become tomorrow's plaintext.