---
title: "WebAuthn and Passkeys: FIDO2 Passwordless Authentication"
description: "How WebAuthn replaces shared secrets with per-origin asymmetric keypairs, why origin binding makes it phishing-resistant by construction, and how to validate a WebAuthn assertion signature server-side in Go."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "webauthn"
  - "passkeys"
  - "fido2"
  - "passwordless"
  - "public-key-cryptography"
  - "phishing-resistant"
  - "relying-party"
---

# WebAuthn and Passkeys: FIDO2 Passwordless Authentication

For decades, passwords have been the default authentication mechanism on the web. They are also the single greatest source of security failures. From credential stuffing and phishing to database leaks, relying on shared secrets is a fundamental security flaw.

The security industry, led by the FIDO Alliance and the World Wide Web Consortium (W3C), developed **WebAuthn (Web Authentication)** and **Passkeys (FIDO2)** to replace passwords entirely. By replacing shared secrets with public-key cryptography tied to physical authenticators, WebAuthn provides a passwordless flow that is cryptographically secure, incredibly fast, and natively immune to phishing.

## The Problem: The Inherent Flaws of Passwords and Shared Secrets

Every standard login system operates on a "shared secret" paradigm:

1. The user creates a secret (password) and shares a hashed version of it with the server.
2. During login, the user transmits the password over the network to the server to prove ownership.

This model is fundamentally vulnerable:

* **The Phishing Threat:** Attackers can easily set up lookalike websites (e.g., `bank-login-scam.com` instead of `bank.com`). If a user inputs their password on the fake site, the credentials are stolen. Multi-Factor Authentication (MFA) like SMS codes or TOTP apps can also be phished by real-time proxy tools that relay the code to the real site within its short validity window.
* **Credential Reuse:** Users reuse passwords across dozens of sites. A breach at a weak discussion forum can compromise administrative accounts at critical financial institutions.
* **Server-Side Leaks:** If an application's database is breached, attackers gain access to millions of password hashes, which can then be cracked offline.

## The Solution: Asymmetric Cryptography and Hardware Attestation

WebAuthn shifts the paradigm from shared secrets to **asymmetric cryptography**. The server never learns, stores, or transmits a private key or password. Instead, authentication is based on a unique private-public keypair generated locally on the user's device (authenticator) for each specific website origin.

### How WebAuthn Registration Works

1. **Initiation:** The user clicks "Register" on the website. The server sends a challenge, along with the website's unique domain identifier (the `rpId`, or Relying Party ID).
2. **Keypair Generation:** The browser requests the local operating system or hardware authenticator (such as a YubiKey, Apple Touch ID, or Windows Hello) to create a new keypair.
3. **User Verification:** The authenticator prompts the user for local verification (fingerprint, face scan, or local PIN). This stays entirely local; biometric data never leaves the device.
4. **Key Delivery:** The authenticator generates a new private-public keypair. The private key remains locked inside the hardware's secure enclave. The public key, along with the cryptographic signature of the challenge, is sent back to the server to be stored in the user directory.

```text
+----------+              +---------------+              +-----------------+
|  Server  |              |    Browser    |              |  Authenticator  |
|          |              |   (Client)    |              | (Secure Enclave)|
+----+-----+              +-------+-------+              +--------+--------+
     |                            |                               |
     | 1. Registration Challenge  |                               |
     +--------------------------->|                               |
     |                            | 2. navigator.credentials.create()
     |                            +------------------------------>|
     |                            |                               | 3. User biometric check
     |                            |                               |    & keypair generation
     |                            |                               +
     |                            | 4. Returns Public Key         |
     |                            |<------------------------------+
     | 5. Store Public Key        |                               |
     |<---------------------------+                               |
```

### How WebAuthn Authentication Works

When logging in, the server generates a random challenge. The browser prompts the authenticator, which asks for biometrics, signs the challenge using the stored private key, and returns the signature to the server. The server verifies the signature against the registered public key. At no point does any secret cross the network — only a signature over a one-time challenge.

## Defenses: Why WebAuthn Is Phishing-Resistant

WebAuthn includes a game-changing security property: **origin binding**.

When the authenticator signs the challenge during authentication, it does not just sign the random bytes; it signs a collection of client data that includes the active browser URL (the origin, e.g., `https://realbank.com`).

Consider an attacker trying to phish a WebAuthn user:

1. The user is lured to `https://fakebank.com`.
2. The malicious site attempts to trigger a WebAuthn authentication flow.
3. The browser detects that the current origin is `fakebank.com` and passes this origin to the hardware authenticator.
4. The authenticator checks its internal storage. It only has credentials associated with the origin `realbank.com`. Because the domain mismatch is detected, the authenticator refuses to sign the challenge using the `realbank.com` private key.
5. Even if the authenticator generated a signature for `fakebank.com`, the server backend for `realbank.com` would reject it because the signature was computed with the wrong key and origin.

The credential is completely useless to the attacker — this is the property that TOTP and SMS-based MFA fundamentally lack: those secrets can be relayed by a phishing proxy because they are not bound to an origin at all.

## Secure Coding: Implementing WebAuthn Validation

WebAuthn backend verification requires parsing binary data structures (CBOR/COSE) and validating cryptographic signatures. A secure Go example validating a WebAuthn assertion signature:

```go
// Go backend validation logic outline using a robust WebAuthn library
package verify

import (
	"crypto/sha256"
	"crypto/x509"
	"errors"
)

// ValidateAssertion verifies the signature provided by the client authenticator.
func ValidateAssertion(clientDataJSON []byte, signature []byte, authenticatorData []byte, publicKeyPEM []byte) error {
	// 1. Hash the client data JSON (which contains the origin and challenge)
	clientDataHash := sha256.Sum256(clientDataJSON)

	// 2. Concatenate authenticatorData and clientDataHash to form the verified signature base
	signatureBase := append(authenticatorData, clientDataHash[:]...)

	// 3. Parse the stored public key (X.509 format)
	pubKey, err := x509.ParsePKIXPublicKey(publicKeyPEM)
	if err != nil {
		return errors.New("failed to parse registered public key")
	}

	// 4. Verify signature using standard cryptographic package
	// (Actual library resolves ECDSA, RSA, or Ed25519 depending on COSE Algorithm)
	return verifyCryptographicSignature(pubKey, signatureBase, signature)
}
```

In production, never hand-roll this parsing — use a maintained library (e.g., `go-webauthn/webauthn`, `@simplewebauthn/server`) that correctly decodes CBOR attestation objects and validates every field (origin, RP ID hash, sign counter, user presence/verification flags) rather than reimplementing byte-offset parsing.

## Developer Takeaways

* **Biometrics Stay Biometric:** Biometric data (fingerprints, face scans) never leaves the user's local device. WebAuthn only uses biometrics to unlock the local private key.
* **Cryptographic Domain Binding:** WebAuthn is the only mainstream authentication mechanism that offers absolute, protocol-level protection against phishing by binding credentials directly to domain origins.
* **No Server-Side Hash Cracking:** Because the server only stores public keys, a database breach does not allow an attacker to crack passwords or authenticators offline.
* **Passkeys Offer Synchronization:** Passkeys allow multi-device synchronization (via Apple iCloud Keychain or Google Password Manager), solving the lost-authenticator recovery problem while maintaining rigorous, phishing-resistant security.

## Key Takeaways

- WebAuthn replaces the shared-secret model with a per-origin asymmetric keypair generated and held entirely on the user's device; the server only ever stores a public key.
- Origin binding — the authenticator refusing to sign a challenge for a domain it wasn't registered against — is what makes WebAuthn phishing-resistant, a property TOTP and SMS OTP structurally lack.
- A database breach of WebAuthn public keys is not useful to an attacker for credential cracking, unlike a breach of password hashes.
- Server-side verification requires parsing CBOR/COSE structures correctly (RP ID hash, flags, signature base) — use a maintained library rather than hand-rolling this parsing logic.
