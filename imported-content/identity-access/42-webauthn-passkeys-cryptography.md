# WebAuthn and Passkeys: FIDO2 Passwordless Auth

For decades, passwords have been the default authentication mechanism on the web. They are also the single greatest source of security failures. From credential stuffing and phishing to database leaks, relying on shared secrets is a fundamental security flaw. 

The security industry, led by the FIDO Alliance and the World Wide Web Consortium (W3C), developed **WebAuthn (Web Authentication)** and **Passkeys (FIDO2)** to replace passwords entirely. By replacing shared secrets with public-key cryptography tied to physical authenticators, WebAuthn provides a passwordless flow that is cryptographically secure, incredibly fast, and natively immune to phishing.

---

## The Problem: The Inherent Flaws of Passwords and Shared Secrets

Every standard login system operates on a "shared secret" paradigm:
1. The user creates a secret (password) and shares a hashed version of it with the server.
2. During login, the user transmits the password over the network to the server to prove ownership.

This model is fundamentally vulnerable:
* **The Phishing Threat:** Attackers can easily set up lookalike websites (e.g., `bank-login-scam.com` instead of `bank.com`). If a user inputs their password on the fake site, the credentials are stolen. Multi-Factor Authentication (MFA) like SMS codes or TOTP apps can also be phished by real-time proxy tools.
* **Credential Reuse:** Users reuse passwords across dozens of sites. A breach at a weak discussion forum can compromise administrative accounts at critical financial institutions.
* **Server-Side Leaks:** If an application's database is breached, attackers gain access to millions of password hashes, which can then be cracked offline.

---

## The Solution: Asymmetric Cryptography and Hardware Attestation

WebAuthn shifts the paradigm from shared secrets to **asymmetric cryptography**. The server never learns, stores, or transmits a private key or password. Instead, authentication is based on a unique private-public keypair generated locally on the user's device (authenticator) for each specific website origin.

### How WebAuthn Register works:
1. **Initiation:** The user clicks "Register" on the website. The server sends a challenge, along with the website's unique domain identifier (the `rpId`, or Relying Party ID).
2. **Keypair Generation:** The browser requests the local operating system or hardware authenticator (such as a YubiKey, Apple Touch ID, or Windows Hello) to create a new keypair.
3. **User Verification:** The authenticator prompts the user for local verification (fingerprint, face scan, or local PIN). This is kept entirely local; biometric data never leaves the device.
4. **Key Delivery:** The authenticator generates a new private-public keypair. The private key remains locked inside the hardware's secure enclave. The public key, along with the cryptographic signature of the challenge, is sent back to the server to be stored in the user directory.

```
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

### How WebAuthn Authentication works:
When logging in, the server generates a random challenge. The browser prompts the authenticator, which asks for biometrics, signs the challenge using the stored private key, and returns the signature to the server. The server verifies the signature against the registered public key.

---

## Defenses: Why WebAuthn is Phishing-Resistant

WebAuthn includes a game-changing security property: **origin binding**. 

When the authenticator signs the challenge during authentication, it does not just sign the random bytes; it signs a collection of client data that includes the active browser URL (the origin, e.g., `https://realbank.com`).

Consider an attacker trying to phish a WebAuthn user:
1. The user is lured to `https://fakebank.com`.
2. The malicious site attempts to trigger a WebAuthn authentication flow.
3. The browser detects that the current origin is `fakebank.com` and passes this origin to the hardware authenticator.
4. The authenticator checks its internal storage. It only has credentials associated with the origin `realbank.com`. Because the domain mismatch is detected, the authenticator refuses to sign the challenge using the `realbank.com` private key.
5. Even if the authenticator generated a signature for `fakebank.com`, the server backend for `realbank.com` would reject it because the signature was computed with the wrong key and origin.

The credential is completely useless to the attacker.

---

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

---

## Developer Takeaways

* **Biometrics Stay Biometric:** Biometric data (fingerprints, face scans) never leaves the user's local device. WebAuthn only uses biometrics to unlock the local private key.
* **Cryptographic Domain Binding:** WebAuthn is the only standard authentication mechanism that offers absolute, protocol-level protection against phishing by binding credentials directly to domain origins.
* **No Server-Side Hash Cracking:** Because the server only stores public keys, a database breach does not allow an attacker to crack passwords or authenticators offline.
* **Passkeys offer Synchronization:** Passkeys allow multi-device synchronisation (via Apple iCloud Keychain or Google Password Manager), solving the lost-authenticator recovery problem while maintaining rigorous, phishing-resistant security.
