# Post-Quantum SSH: Configuring OpenSSH with `sntrup761x25519-sha512`

## The Problem: Persistent SSH Vulnerability
Secure Shell (SSH) is the ubiquitous protocol for remote system administration. An SSH session relies on two distinct cryptographic operations:
1.  **Key Exchange (KEX):** Typically ECDH (Curve25519), used to negotiate the symmetric session key.
2.  **Authentication:** Typically RSA or Ed25519, used to prove the identity of the server (Host Key) and the client (User Key).

Both are vulnerable to a Cryptographically Relevant Quantum Computer (CRQC). The immediate threat is against the Key Exchange. If a nation-state is passively tapping traffic to a critical Linux server (the "Store Now, Decrypt Later" attack), they can capture the ECDH handshake today and decrypt the entire administrative session (commands, passwords, exfiltrated files) tomorrow.

## The Solution: OpenSSH's Hybrid KEX
OpenSSH developers did not wait for NIST to finalize the PQC standards. Starting in OpenSSH 9.0 (released April 2022), the default Key Exchange algorithm was silently upgraded to a hybrid post-quantum algorithm: `sntrup761x25519-sha512`.

This is a Hybrid Key Encapsulation Mechanism combining:
*   **sntrup761:** Streamlined NTRU Prime (a lattice-based PQC algorithm, specifically parameter set 761).
*   **x25519:** Classical Elliptic Curve Diffie-Hellman over Curve25519.
*   **sha512:** Used as the Key Derivation Function (KDF) to tie the two shared secrets together.

### Why NTRU Prime and not Kyber (ML-KEM)?
When OpenSSH 9.0 was released, Kyber was still under active modification by NIST. The OpenSSH developers preferred NTRU Prime because it was designed specifically to minimize attack surfaces and side-channels, and it avoided the intellectual property and patent complexities that temporarily clouded other lattice submissions. Even though NIST ultimately standardized Kyber/ML-KEM, `sntrup761` remains highly secure and is the default in millions of OpenSSH deployments today.

### Auditing and Enforcing PQC in SSH
By default, OpenSSH 9.0+ prefers `sntrup761x25519-sha512`. However, if an older client connects, the server will downgrade to classical `curve25519-sha256`. 

To strictly enforce quantum-safe key exchanges, administrators must configure `sshd_config` to reject classical algorithms.

**1. Verify Client/Server Support**
Check your OpenSSH version and supported KEX algorithms:
```bash
ssh -Q kex | grep sntrup
# Expected output: sntrup761x25519-sha512@openssh.com
```

**2. Hardening `sshd_config` (Server Side)**
Edit `/etc/ssh/sshd_config` to restrict the allowed Key Exchange algorithms:
```text
# /etc/ssh/sshd_config

# Force Hybrid PQC Key Exchange. 
# Warning: This will break connections from OpenSSH clients < 9.0 
# or clients like PuTTY that do not yet support this KEX.
KexAlgorithms sntrup761x25519-sha512@openssh.com

# Ensure symmetric ciphers are Grover-resistant (AES-256 or ChaCha20)
Ciphers chacha20-poly1305@openssh.com,aes256-gcm@openssh.com

# Ensure strong MACs
MACs hmac-sha2-512-etm@openssh.com,hmac-sha2-256-etm@openssh.com
```
Restart the SSH daemon after testing the configuration with `sshd -t`.

**3. Hardening `~/.ssh/config` (Client Side)**
If you want your client to strictly refuse classical connections to servers:
```text
# ~/.ssh/config
Host critical-infrastructure.*
    KexAlgorithms sntrup761x25519-sha512@openssh.com
    Ciphers chacha20-poly1305@openssh.com
```

### The Next Frontier: Post-Quantum Authentication
While `sntrup761x25519-sha512` protects the *session data* against Store-Now-Decrypt-Later, the *authentication* (Ed25519 host and user keys) remains classical. A CRQC could forge a host key and execute an active Man-in-the-Middle (MitM) attack. 

OpenSSH is currently experimenting with ML-DSA (Dilithium) for host and user keys. Because ML-DSA keys are massive, they will likely be deployed as hybrid certificates in future OpenSSH releases, allowing seamless, fully quantum-safe administrative shells. For now, enforcing the hybrid KEX is the critical first step.