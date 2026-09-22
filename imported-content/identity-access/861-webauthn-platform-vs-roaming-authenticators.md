# WebAuthn: Platform vs Roaming Authenticators and CTAP2 Protocol Handshakes

## The Problem: The Challenge of Enforcing Hardware Cryptographic Assurances

When engineering passwordless authentication with WebAuthn (FIDO2), developers face complex, state-dependent architectural options. The key design issue centers around authenticator selection. Specifically, how does an application securely specify, enforce, and verify the physical and structural differences between **Platform Authenticators** and **Roaming Authenticators**?

A platform authenticator is embedded directly inside the user's host operating system or device hardware (e.g., Apple Touch ID / Face ID, Windows Hello, Android Biometrics). A roaming authenticator is physically decoupled from the host device, interfacing via USB, NFC, or Bluetooth Low Energy (BLE) (e.g., YubiKeys, Feitian keys, Google Titan keys).

Selecting the incorrect authenticator constraints, or failing to parse the FIDO Client-to-Authenticator Protocol (CTAP2) responses correctly, results in fragile user experiences (e.g., prompting a user for a fingerprint on a desktop without biometrics) or security vulnerabilities (e.g., allowing untrusted hardware to pass as a high-security hardware security module).

---

## Technical Architecture

The following diagram illustrates the relationship between the browser (User Agent), the WebAuthn API, and the local buses managing Platform/Roaming authenticators via the CTAP2 protocol:

```
+---------------------------------------------------------------------------------+
|                                  Client Device                                  |
|                                                                                 |
|   +-------------------------------------------------------------------------+   |
|   |                         Browser (WebAuthn Client)                       |   |
|   +-------------------------------------------------------------------------+   |
|         |                                                           |           |
|         | (CTAP2 over Local OS API)                                 | (CTAP2)   |
|         v                                                           v           |
|   +-----------------------------------+                       +-------------+   |
|   |       Platform Authenticator      |                       |  USB / NFC  |   |
|   |  (FaceID, TouchID, Win Hello)     |                       |  Controller |   |
|   +-----------------------------------+                       +-------------+   |
+----------------------------------------------------------------------|----------+
                                                                       | (Physical Bus)
                                                                       v
                                                                +-------------+
                                                                |   Roaming   |
                                                                |  YubiKey    |
                                                                +-------------+
```

---

## Core Handshake Principles & CTAP2

When a Relying Party (RP) initiates WebAuthn, it issues a cryptographic challenge. Under the hood:
1. The browser coordinates with the local OS platform to execute the CTAP2 handshake.
2. If **User Verification (UV)** is configured as `required`, the authenticator must verify the user's local presence via PIN, password, or biometrics.
3. If **User Presence (UP)** is required, a simple capacitive touch of a button is sufficient.
4. The authenticator generates a signature over the concatenated hash of `clientDataJSON` and `authenticatorData` using its private key, returning the signature alongside structural metadata (the `authData` byte array) to the RP.

---

## Code Implementation: TypeScript (Node.js)

The following Node.js backend module demonstrates how to securely parse and cryptographically verify a WebAuthn assertion signature (login verification phase) from first principles.

```typescript
import * as crypto from 'crypto';

interface AssertionVerificationRequest {
  credentialId: string;
  clientDataJSON: string;      // Base64URL encoded
  authenticatorData: string;   // Base64URL encoded
  signature: string;           // Base64URL encoded
  publicKeyPem: string;        // PEM public key retrieved from storage during registration
  expectedChallenge: string;   // Original challenge issued to the client
  expectedOrigin: string;      // Expected client origin (e.g., "https://auth.serenya.io")
}

export class WebAuthnAssertionVerifier {
  
  private static base64UrlToBuffer(base64url: string): Buffer {
    let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    return Buffer.from(base64, 'base64');
  }

  /**
   * Securely validates a client assertion (login).
   */
  public static verifyAssertion(req: AssertionVerificationRequest): boolean {
    const clientDataBuffer = this.base64UrlToBuffer(req.clientDataJSON);
    const authDataBuffer = this.base64UrlToBuffer(req.authenticatorData);
    const signatureBuffer = this.base64UrlToBuffer(req.signature);

    // 1. Verify Client Data (Origin, Challenge, Type)
    const clientDataParsed = JSON.parse(clientDataBuffer.toString('utf8'));
    
    if (clientDataParsed.type !== 'webauthn.get') {
      throw new Error('WebAuthn Error: Invalid event type in clientDataJSON.');
    }

    if (clientDataParsed.challenge !== req.expectedChallenge) {
      throw new Error('WebAuthn Error: Cryptographic challenge mismatch.');
    }

    if (clientDataParsed.origin !== req.expectedOrigin) {
      throw new Error('WebAuthn Error: Origin validation failed.');
    }

    // 2. Parse Authenticator Data Flags
    // Flags are located at byte 32 of authenticatorData
    if (authDataBuffer.length < 37) {
      throw new Error('WebAuthn Error: authenticatorData is malformed.');
    }
    const flagsByte = authDataBuffer[32];
    
    const userPresenceBit = (flagsByte & 0x01) !== 0; // Bit 0: User Present (UP)
    const userVerifiedBit = (flagsByte & 0x04) !== 0; // Bit 2: User Verified (UV)

    // Enforce that at least User Presence was checked during assertion
    if (!userPresenceBit) {
      throw new Error('Security Error: User Presence flag was not set by authenticator.');
    }

    // 3. Reconstruct Signed Data Payload
    // The signature is calculated over: authenticatorData + SHA-256(clientDataJSON)
    const clientDataHash = crypto.createHash('sha256').update(clientDataBuffer).digest();
    const verificationPayload = Buffer.concat([authDataBuffer, clientDataHash]);

    // 4. Cryptographically Validate Signature over the Payload
    const verify = crypto.createVerify('SHA256');
    verify.update(verificationPayload);
    
    const signatureValid = verify.verify(req.publicKeyPem, signatureBuffer);
    if (!signatureValid) {
      throw new Error('Security Error: Cryptographic signature verification failed.');
    }

    return true;
  }
}
```

---

## Operational Verification

To verify your WebAuthn implementation:
- Test registration flows with `authenticatorAttachment` set to `platform` to ensure users are guided to face/touch scanners.
- Set `authenticatorAttachment` to `cross-platform` to force external hardware key prompts.
- Ensure your server strictly rejects assertions where the `userPresenceBit` (UP) or `userVerifiedBit` (UV) is unset, preventing blind replay signatures from software bypass scripts.
