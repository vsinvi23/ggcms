# Encrypted Client Hello (ECH): Closing the TLS 1.3 SNI Privacy Leak

## The Problem: The SNI Privacy Leak in TLS
Transport Layer Security (TLS) 1.3 brought massive improvements to web privacy by encrypting the majority of the TLS handshake, including the server certificate. However, one glaring privacy leak remained: the **Server Name Indication (SNI)** extension. 

When a client initiates a TLS connection, it sends a `ClientHello` message in plaintext. Because modern web infrastructure uses reverse proxies and CDNs hosting millions of domains on a single IP address, the server doesn't know which certificate to serve unless the client explicitly requests a domain name. 

The client includes this domain name in the SNI extension of the plaintext `ClientHello`. Consequently, any passive eavesdropper—your ISP, network administrators, or state-level firewalls—can see exactly which website you are visiting, even if the subsequent traffic is fully encrypted.

## The Solution: Encrypted Client Hello (ECH)
Encrypted Client Hello (ECH), previously known as Encrypted SNI (ESNI), completely patches this leak. Instead of sending the actual destination domain in the plaintext SNI, ECH encrypts the sensitive portions of the `ClientHello` and encapsulates them inside a generic, unencrypted "outer" `ClientHello`. 

The outer `ClientHello` points to the CDN or hosting provider's generic front-end domain (e.g., `cloudflare-ech.com`), while the inner encrypted `ClientHello` contains the true destination (e.g., `secret-site.com`).

## Mental Model: The Envelope within an Envelope
Think of ECH as a double-envelope system for mail. 
1. **The Outer Envelope (Unencrypted):** Addressed to the mailroom of a large office building (the CDN). Anyone looking at the mail can only see it's going to the mailroom.
2. **The Inner Envelope (Encrypted):** Addressed to a specific employee inside the building (the actual target domain). The mailroom opens the outer envelope, decrypts the inner envelope using a special key, and routes the connection to the correct employee.

## Technical Details: How ECH Works

To encrypt the inner `ClientHello`, the client needs a public key belonging to the server's infrastructure. How does it get this key before the TLS connection is established? It uses DNS.

### Step 1: ECH Config via HTTPS DNS Records
The server operator publishes an `ECHConfigList` via a new DNS record type called `HTTPS`. This configuration contains the provider's public key (typically an HPKE—Hybrid Public Key Encryption—key).

```text
# Example DNS lookup for the HTTPS record
$ dig HTTPS secret-site.com
secret-site.com.  300  IN  HTTPS  1 . alpn="h2,http/1.1" ech="<base64_encoded_ECHConfigList>"
```

### Step 2: The ECH Handshake 
When the client resolves the DNS, it retrieves the `ECHConfigList`. It uses HPKE to encrypt the inner `ClientHello` containing the true SNI (`secret-site.com`). 

The client sends this structure over the wire:

```text
ClientHello (Outer)
  SNI: cloudflare-ech.com (The client-facing provider)
  Extension: ech
    [ Encrypted Inner ClientHello ]
      -> SNI: secret-site.com
      -> True ALPN, cipher suites, etc.
```

### Step 3: Server-side Decryption
1. The CDN's edge server receives the outer `ClientHello`. 
2. It sees the `ech` extension and uses its private HPKE key to decrypt the inner `ClientHello`.
3. Upon successful decryption, the edge server replaces the outer `ClientHello` parameters with the inner `ClientHello` parameters.
4. The TLS 1.3 handshake proceeds normally, but now mapped to `secret-site.com`.

If the decryption fails (perhaps because the ECH keys were rotated), the server falls back to the outer `ClientHello` and issues an `ECH Required` response, providing the client with the updated `ECHConfigList` to retry the connection.

## Cryptographic Engine: HPKE (Hybrid Public Key Encryption)
ECH relies heavily on HPKE (RFC 9180), which combines Key Encapsulation Mechanisms (KEM) with Authenticated Encryption with Associated Data (AEAD). 

```python
# Conceptual representation of HPKE in ECH
def construct_ech_payload(server_public_key, inner_hello_bytes):
    # 1. Generate an ephemeral Diffie-Hellman key pair
    ephemeral_priv, ephemeral_pub = generate_dh_keypair()
    
    # 2. Perform Diffie-Hellman to derive a shared secret
    shared_secret = dh_compute(ephemeral_priv, server_public_key)
    
    # 3. Derive AEAD key and nonce using HKDF
    aead_key, aead_nonce = hkdf_derive(shared_secret, "ech-context")
    
    # 4. Encrypt the inner Client Hello
    encrypted_inner = aead_encrypt(aead_key, aead_nonce, inner_hello_bytes)
    
    return ephemeral_pub, encrypted_inner
```

## Summary
The plaintext SNI has long been the Achilles' heel of internet privacy. ECH solves this by securely distributing public keys via DNS `HTTPS` records and utilizing HPKE to encapsulate the true connection intent. By hiding the destination domain behind the generic infrastructure of a CDN, ECH closes the last major metadata leak in modern TLS, ensuring that deep packet inspection can only reveal the hosting provider, never the specific website you are visiting.
