# WebAuthn: Platform vs Roaming Authenticators and CTAP2 Protocol Handshakes

The Web Authentication API (WebAuthn) represents a monumental shift away from passwords toward cryptographically secure, hardware-bound credentials. To implement WebAuthn securely at the production level, software architects must understand how authenticators differ (Platform vs. Roaming) and how client browsers exchange binary messages with hardware via the Client-to-Authenticator Protocol (CTAP2).

---

## The Problem: Secure Hardware-Bound Binding

Traditional multi-factor authentication (MFA) mechanisms (SMS, TOTP) are vulnerable to phishing and middle-in-the-middle (MitM) attacks. WebAuthn solves this by utilizing asymmetric public-key cryptography tied strictly to a specific domain (Origin-bound).

However, developers face critical design questions when structuring WebAuthn policies:
1. **Platform Authenticators:** Integrated into the operating system or device hardware (e.g., Apple TouchID/FaceID, Windows Hello, Android Biometrics). They are extremely user-friendly but cannot be moved between devices.
2. **Roaming Authenticators:** External hardware security keys (e.g., YubiKeys, Google Titan Keys, smart cards) communicating via USB, NFC, or Bluetooth. They offer high portability but require users to carry a physical key.
3. **The CTAP2 Boundary:** How does the browser securely instruct external hardware to perform cryptographic signatures over a secure bus (USB/Bluetooth) without leaking key material?

---

## Technical Architecture: FIDO2 / WebAuthn and CTAP2 Flow

The WebAuthn ecosystem splits communication. The **Relying Party (RP - Server)** talks to the **Client (Browser)** via HTTPS using the WebAuthn JavaScript API. In turn, the **Client** talks to the **Authenticator** via raw USB/NFC using the **CTAP2** binary protocol.

```
+--------------------+               +------------------+               +-----------------------+
|  Relying Party     |   HTTPS (JSON)|  Client (Browser)|   CTAP2 (CBOR)|     Authenticator     |
|  (Server / Backend)|               |  (User Agent)    |               | (TouchID / YubiKey)   |
+--------------------+               +------------------+               +-----------------------+
          |                                    |                                    |
          | 1. Generate Challenge              |                                    |
          |    & RP Credentials Settings       |                                    |
          |----------------------------------->|                                    |
          |                                    | 2. Map JSON options to binary      |
          |                                    |    CTAP2 command                   |
          |                                    |----------------------------------->|
          |                                    |                                    |
          |                                    | 3. User verification (Pin/PIN/Bio) |
          |                                    |    & Asymmetric Keypair Generation |
          |                                    |    [Hardware Enclave Action]       |
          |                                    |<-----------------------------------|
          |                                    |                                    |
          |                                    | 4. Returns CBOR payload containing |
          |                                    |    Credential ID, Public Key, & Sig|
          |                                    |<-----------------------------------|
          | 5. Verify Signature, challenge,    |                                    |
          |    and Origin (Prevent phishing)   |                                    |
          |<-----------------------------------|                                    |
```

---

## Production-Grade Code: Server-Side Registration Challenge & Verification

Here is a backend node implementation of a WebAuthn registration verifier. This handles challenge generation and CBOR parsing, verifying the authenticator data, attestation signature, and origin boundaries.

```typescript
import * as crypto from 'crypto';
import cbor from 'cbor'; // CBOR parser for WebAuthn binary payloads

interface RegistrationOptions {
  challenge: string;
  rp: { name: string; id: string };
  user: { id: string; name: string; displayName: string };
  pubKeyCredParams: Array<{ type: 'public-key'; alg: number }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform'; // Strict attachment filter
    userVerification?: 'required' | 'preferred' | 'discouraged';
  };
}

/**
 * Generates options for navigator.credentials.create()
 */
export function generateRegistrationOptions(userId: string, username: string, rpId: string): RegistrationOptions {
  const challenge = crypto.randomBytes(32).toString('base64url');
  
  return {
    challenge,
    rp: { name: 'Serenya Enterprise Gateway', id: rpId },
    user: {
      id: Buffer.from(userId).toString('base64url'),
      name: username,
      displayName: username,
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },   // ES256 (ECDSA using P-256 and SHA-256)
      { type: 'public-key', alg: -257 }, // RS256 (RSASSA-PKCS1-v1_5 using SHA-256)
    ],
    authenticatorSelection: {
      authenticatorAttachment: 'platform', // Restrict to built-in biometrics (Platform)
      userVerification: 'required',        // Require active biometric check / PIN
    },
  };
}

/**
 * Verifies the binary Attestation Payload received from Client browser
 */
export async function verifyRegistrationResponse(
  clientDataJSONBase64: string,
  attestationObjectBase64: string,
  expectedChallenge: string,
  expectedOrigin: string
): Promise<{ credentialId: string; publicKeyPem: string }> {
  
  // 1. Decode ClientDataJSON (Contains origin, challenge, and action type)
  const clientDataJSON = Buffer.from(clientDataJSONBase64, 'base64url').toString('utf8');
  const clientData = JSON.parse(clientDataJSON);

  if (clientData.challenge !== expectedChallenge) {
    throw new Error('Registration integrity breach: Challenge mismatch.');
  }
  if (clientData.origin !== expectedOrigin) {
    throw new Error('Registration integrity breach: Origin verification failed (Phishing attempt blocked).');
  }
  if (clientData.type !== 'webauthn.create') {
    throw new Error('Invalid authentication context type.');
  }

  // 2. Decode AttestationObject (CBOR encoded data from hardware)
  const attestationBuffer = Buffer.from(attestationObjectBase64, 'base64url');
  const attestation = cbor.decodeFirstSync(attestationBuffer);

  const { authData } = attestation;
  
  // 3. Parse Authenticator Data (authData structure is packed binary)
  // RP ID Hash (32 bytes) | Flags (1 byte) | Sign Count (4 bytes) | Attested Credential Data (variable)
  const rpIdHash = authData.subarray(0, 32);
  const flags = authData[32];
  
  // Bit 0: User Present (UP), Bit 2: User Verified (UV), Bit 6: Attested Credential Data Present (AT)
  const userPresent = (flags & 0x01) !== 0;
  const userVerified = (flags & 0x04) !== 0;
  const hasAttestedCredData = (flags & 0x40) !== 0;

  if (!userPresent || !userVerified) {
    throw new Error('Verification failure: User biometrics or PIN verification not active.');
  }

  if (!hasAttestedCredData) {
    throw new Error('Validation failed: Missing attested credential descriptor block.');
  }

  // Extract Credential ID and Public Key (COSE format)
  const aaguid = authData.subarray(37, 53); // Authenticator unique GUID
  const credIdLength = authData.readUInt16BE(53);
  const credentialId = authData.subarray(55, 55 + credIdLength).toString('base64url');
  
  const rawCosePublicKey = authData.subarray(55 + credIdLength);
  const cosePublicKey = cbor.decodeFirstSync(rawCosePublicKey);

  // Translate COSE public key (e.g. EC2 key parameters) to standard PEM/DER for storage
  // (In practice, store standard public key coordinates x, y, and curve parameter)
  
  return {
    credentialId,
    publicKeyPem: rawCosePublicKey.toString('base64'),
  };
}
```

---

## Cryptographic Handshake Deep-Dive

During WebAuthn authentication via **CTAP2**, the client requests a signature from the authenticator. 
- The authenticator validates the origin domain hash matching the stored `rpIdHash`.
- The user completes authorization (biometric touch).
- The internal cryptographic core uses the private key to sign the concatenation of `authData` and a SHA-256 hash of `clientDataJSON`.
- This ensures that if any part of the domain name (Origin), HTTP scheme, or challenge is altered by a malicious site, the signature validation fails on the server, eliminating modern phishing strategies.
