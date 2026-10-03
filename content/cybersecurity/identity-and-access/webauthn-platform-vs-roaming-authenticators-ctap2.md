---
title: "WebAuthn: Platform vs Roaming Authenticators and CTAP2 Protocols"
description: "How WebAuthn's phishing-resistant, origin-bound credentials work across Platform authenticators (Touch ID, Windows Hello) and Roaming authenticators (YubiKeys) via CTAP2, and the registration options that determine which one a Relying Party actually gets."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "webauthn"
  - "fido2"
  - "ctap2"
  - "passkeys"
  - "phishing-resistant-authentication"
  - "attestation"
---

# WebAuthn: Platform vs Roaming Authenticators and CTAP2 Protocols

## The Problem

Password-based authentication and legacy multi-factor solutions (such as SMS codes, push notifications, and TOTP mobile apps) remain highly vulnerable to modern proxy-based phishing attacks (using tools like Evilginx). Attackers can sit in the middle of an authentication flow, transparently harvesting password credentials and session cookies in real-time.

To eliminate this class of threat, the FIDO2 standard introduces WebAuthn — a cryptographically backed, phishing-resistant framework that binds cryptographic credentials directly to the origin domain of the relying party (RP). However, developers implementing WebAuthn often struggle to design user-friendly enrollment and authentication flows because they fail to distinguish between **Platform** and **Roaming** authenticators. Furthermore, they are often unfamiliar with how the Client-to-Authenticator Protocol (CTAP2) functions, which can lead to misconfigurations that expose users to authentication lockouts or suboptimal security levels.

## The Mental Model

The WebAuthn ecosystem splits hardware authenticators into two categories, both communicating with the browser and host operating system using the standardized FIDO2 CTAP2 protocol:

```
                  +---------------------------+
                  |  Relying Party (Web App)  |
                  +---------------------------+
                                |
                     WebAuthn JS API calls
                                v
                  +---------------------------+
                  | Browser & Host OS (Client)|
                  +---------------------------+
                        /               \
                       /                 \  CTAP2 Protocol
                      / (Internal Bus)    \ (USB / NFC / BLE)
                     v                     v
          +-----------------------+   +----------------------+
          | Platform Authenticator|   | Roaming Authenticator|
          |  (FaceID, TouchID,    |   |  (YubiKey, SoloKey,  |
          |   Windows Hello, TPM) |   |   External FIDO2 key)|
          +-----------------------+   +----------------------+
```

- **Platform Authenticators**: Built directly into the user's device (e.g., Apple FaceID/TouchID, Android Biometrics, Windows Hello). They are highly convenient but bound strictly to that physical device.
- **Roaming Authenticators**: Out-of-band physical devices (e.g., USB-A/C, NFC, or BLE security keys) that travel with the user. They are extremely secure and allow authentication across any compatible host hardware.

## Attack Vectors & Implementation Pitfalls

1. **Authenticator Binding Downgrade**: If an RP application does not explicitly configure its registration options, it may default to allowing any authenticator. A naive RP might assume a user registered a highly secure roaming security key, when in fact they enrolled a software-backed virtual authenticator on a vulnerable virtual machine, which could be extracted if the VM is compromised.
2. **Account Recovery Lockouts**: RPs often force users to register only a Platform Authenticator (e.g., TouchID) for convenience. If that device is lost, broken, or upgraded, the user is completely locked out. RPs must actively encourage users to register at least one Roaming Authenticator as a physical backup.
3. **Phishing via Attestation Bypasses**: In highly regulated environments (such as financial or defense sectors), RPs must verify that credentials reside on hardware-hardened cryptographic chips. If the RP does not perform attestation verification, an attacker could simulate a fake virtual token during registration, producing keys that are soft-stored on disk instead of in a physical HSM/TPM.

## Defensive Architecture

Securing WebAuthn registration requires precise control over the options sent to `navigator.credentials.create()`.

### JavaScript: Enforcing Authenticator Types and Verification

The following JavaScript snippet illustrates how to trigger a secure WebAuthn credential registration, explicitly configuring the required authenticator attachment type and user verification constraints.

```javascript
// WebAuthn Registration Options Configuration
const publicKeyCredentialCreationOptions = {
  challenge: Uint8Array.from("secure-random-challenge-from-server", c => c.charCodeAt(0)),
  rp: {
    name: "Serenya Multi-Agent Portal",
    id: "serenya.com" // Tied strictly to the domain (Origin-bound phishing resistance)
  },
  user: {
    id: Uint8Array.from("user-id-uuid-12345", c => c.charCodeAt(0)),
    name: "alice@serenya.com",
    displayName: "Alice Smith"
  },
  pubKeyCredParams: [
    { alg: -7, type: "public-key" }, // ES256 (Elliptic Curve, widely supported)
    { alg: -257, type: "public-key" } // RS256 (RSA Digital Signature)
  ],
  timeout: 60000,

  // Enforce specific authenticator attachment styles
  // Use "cross-platform" to force Roaming keys (YubiKeys), "platform" for built-in biometric hardware
  authenticatorSelection: {
    authenticatorAttachment: "cross-platform", // Force roaming hardware
    requireResidentKey: true, // Generate discoverable credentials (usernameless login)
    userVerification: "required" // Force PIN or biometric entry (protects against physical theft)
  },

  // Request direct attestation to verify the authenticity of the hardware chip
  attestation: "direct"
};

// Initiate credential generation in the browser
async function enrollFIDO2Key() {
  try {
    const credential = await navigator.credentials.create({
      publicKey: publicKeyCredentialCreationOptions
    });
    console.log("WebAuthn enrollment success:", credential);
    // Transmit credential back to server for parsing and validation
  } catch (err) {
    console.error("Enrollment failed:", err.message);
  }
}
```

### The CTAP2 Execution Flow Underneath

Whether the browser talks to a platform authenticator or a roaming one, the same four-step CTAP2 exchange happens under the hood:

1. **Challenge Issuance:** The Relying Party (RP) sends a random challenge, its RP ID, and user information to the browser.
2. **User Presence & Verification (UP/UV):** The browser requests authentication via CTAP2. The hardware key flashes, demanding touch (User Presence) and/or a PIN/biometric check (User Verification).
3. **Cryptographic Signing:** The authenticator signs the challenge and origin using its hardware-protected private key.
4. **Assertion Verification:** The signature is sent back via WebAuthn to the RP, which validates it using the previously registered public key.

The core security property this delivers is **Origin Binding**: the browser supplies the exact origin of the page (e.g., `https://bank.serenya.com`) to the authenticator, which signs the challenge bound exclusively to that domain. If a user is tricked into visiting `https://bank.serenya.phish.com`, the browser passes this malicious origin to the key, the key detects the domain mismatch, and it refuses to sign — regardless of whether the authenticator is platform or roaming.

## Best Practices

- **Implement a Multi-Key Strategy**: Always allow users to register multiple keys. Recommend registering one platform key (for speed) and one roaming key (for recovery and cross-device flexibility).
- **Verify Domain Bounds**: Ensure your backend server strictly validates the client's `origin` matches your real application domain to guarantee phishing resistance.
- **Enforce User Verification**: Always set `userVerification` to `required` or `preferred` to ensure that physical theft of a device does not automatically compromise user accounts.
- **Hardware-locked PIN retries**: CTAP2 authenticators block brute-force PIN attacks by locking after 3-15 incorrect attempts, requiring a factory reset that destroys the credentials — but this only protects the authenticator itself. Combine it with short session lifetimes and `HttpOnly`/`Secure`/`SameSite` cookies so a stolen post-login session cookie can't bypass FIDO2 entirely.
