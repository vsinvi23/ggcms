# TLS Cipher Suites: The Deprecation of CBC, RC4, and RSA Key Exchange in TLS 1.3

## The Problem: The Cryptographic Bloat of TLS 1.2

The Transport Layer Security (TLS) protocol evolved over decades from its ancestor, SSL. By the time TLS 1.2 was standardized in 2008, it carried immense technical debt. The protocol supported a massive menu of cipher suites, allowing servers and clients to negotiate combinations of key exchange mechanisms, encryption algorithms, and hashing functions.

This flexibility became its greatest vulnerability. Many of the supported algorithms were cryptographically fragile. Downgrade attacks (like Logjam and FREAK) allowed attackers to force clients into negotiating these weak suites. To secure the web, the IETF took a brutal approach with TLS 1.3 in 2018: **mass deprecation**.

This article explores the three major cryptographic mechanisms killed off in TLS 1.3 and why they had to die.

## 1. The Death of RSA Key Exchange (Lack of Forward Secrecy)

In legacy TLS, the most common way to negotiate a symmetric session key was via RSA Key Exchange. 

The mechanism was straightforward:
1. The server sends its public RSA key in its certificate.
2. The client generates a random "Pre-Master Secret", encrypts it with the server's public key, and sends it back.
3. Both sides derive the session keys from this secret.

### The Fatal Flaw

RSA Key Exchange lacks **Perfect Forward Secrecy (PFS)**. If a nation-state or hacker records months of encrypted TLS traffic between a client and a server, they cannot read it. However, if they later manage to steal the server's private RSA key, they can retroactively decrypt all historical traffic. The static private key protects all past sessions.

### The TLS 1.3 Solution
TLS 1.3 bans static RSA key exchange entirely. It mandates the use of **Ephemeral Elliptic-Curve Diffie-Hellman (ECDHE)**. In ECDHE, fresh, temporary keypairs are generated for *every single connection* and destroyed immediately after the handshake. Even if the server's long-term identity key is stolen, historical traffic remains perfectly secure because the keys used to encrypt that data are gone forever.

## 2. The Death of Cipher Block Chaining (CBC) and MAC-then-Encrypt

TLS 1.2 heavily utilized block ciphers like AES operating in Cipher Block Chaining (CBC) mode. Block ciphers require data to be a multiple of the block size (e.g., 16 bytes for AES). If the plaintext doesn't fit, padding is added.

Legacy TLS used a **MAC-then-Encrypt (MtE)** paradigm:
1. Compute the Message Authentication Code (MAC) over the plaintext.
2. Append the MAC to the plaintext.
3. Add padding to make the total length a multiple of the block size.
4. Encrypt the whole package using CBC mode.

### The Padding Oracle Nightmare

This specific order of operations opened the door to Padding Oracle Attacks (like POODLE and Lucky13). When a server decrypted a CBC message, it checked the padding first. If the padding was invalid, it threw an error (or took a slightly different amount of time to respond) before checking the MAC. 

An active MitM attacker could intercept ciphertext, flip bits, and send it to the server. By observing the server's responses (valid padding vs. MAC failure), the attacker could mathematically deduce the plaintext one byte at a time, completely breaking the encryption.

### The TLS 1.3 Solution
TLS 1.3 strips out CBC mode entirely. It exclusively permits **Authenticated Encryption with Associated Data (AEAD)** ciphers, such as AES-GCM and ChaCha20-Poly1305. AEAD constructions securely combine encryption and integrity checking into a single, unified mathematical operation, effectively eliminating padding oracles.

## 3. The Death of RC4

RC4 was a widely used stream cipher because it was incredibly fast and immune to the padding oracle attacks that plagued CBC mode. When BEAST and POODLE were published, many system administrators actually prioritized RC4 to avoid CBC vulnerabilities.

### The Statistical Biases

RC4 works by generating a pseudorandom stream of bytes (keystream) which is XORed against the plaintext. However, cryptanalysts discovered that RC4's keystream is not truly random. 

The first few bytes of the keystream strongly leak information about the underlying key. Furthermore, certain bytes appear with higher statistical probability than others (e.g., the second byte of the keystream has a disproportionately high chance of being `0x00`). If an attacker forces a client to repeatedly send the same request (like a session cookie) over many RC4 connections, they can perform a statistical analysis on the ciphertexts to recover the plaintext cookie.

### The TLS 1.3 Solution
RC4 was explicitly prohibited. Stream cipher needs are now fulfilled by the modern, mathematically robust ChaCha20 cipher.

## Conclusion

```text
TLS 1.2 Cipher Suite Example:
TLS_RSA_WITH_AES_256_CBC_SHA256
(Vulnerable to lack of PFS and Padding Oracles)

TLS 1.3 Cipher Suite Example:
TLS_AES_256_GCM_SHA384
(Inherently uses Ephemeral Diffie-Hellman, no CBC, no RSA Key Exchange)
```

TLS 1.3 is not just an upgrade; it is a fundamental pruning of cryptographic history. By discarding RSA key exchange, CBC mode, and broken stream ciphers, TLS 1.3 drastically reduced the attack surface, simplifying implementations and paving the way for a faster, structurally secure web.
