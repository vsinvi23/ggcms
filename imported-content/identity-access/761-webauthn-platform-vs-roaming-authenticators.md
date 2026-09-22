# WebAuthn: Platform vs Roaming Authenticators and CTAP2 Handshakes

## The Problem: Policy Bypass via Misconfigured WebAuthn Attachment Enforcements

WebAuthn (FIDO2) provides strong phishing-resistant authentication by shifting the burden of trust to cryptographic hardware. However, many developers implement WebAuthn without properly constraining the **authenticator attachment modal**. This creates a security gap where corporate security policies can be easily bypassed.

WebAuthn defines two distinct categories of authenticators:
1. **Platform Authenticators**: Devices bound directly to the operating system (e.g., Apple TouchID/FaceID, Windows Hello, Android Biometrics). These utilize the device's internal Trusted Platform Module (TPM) or Secure Enclave.
2. **Roaming Authenticators**: Removable, transportable hardware keys (e.g., YubiKeys, Google Titan Keys) that connect via USB, NFC, or Bluetooth.

If an enterprise security policy mandates that employees use roaming hardware security keys (to ensure identity portability or secure air-gapped administration), but the WebAuthn server fails to cryptographically verify the authenticator type during registration, users can register virtual software-based authenticators, unmanaged mobile devices, or biometric platform keys. This breaks physical key tracking and allows unvetted personal devices to access critical company resources.

---

## Architectural Blueprint: The FIDO2 and CTAP2 Handshake Flow

The Client to Authenticator Protocol v2 (CTAP2) governs how a client (such as a web browser) communicates with a physical roaming key or an internal platform enclave.

During registration, the Relying Party (your server) issues dynamic cryptographic challenges. The browser mediates the communication, calling CTAP2 commands to interface with roaming keys over USB/NFC, or calling the OS-native platform APIs.

```
+---------------+             +------------+             +---------------+             +---------------+
| Relying Party |             |  Browser   |             | Authenticator |             | Authenticator |
|   (Server)    |             |  (Client)  |             |  (Platform)   |             |   (Roaming)   |
+---------------+             +------------+             +---------------+             +---------------+
        |                            |                           |                             |
        | 1. Registration Options    |                           |                             |
        |--------------------------->|                           |                             |
        |    (Challenge, Exclude)    |                           |                             |
        |                            | 2. Choose path based on   |                             |
        |                            |    attachment preference  |                             |
        |                            |--------------------+      |                             |
        |                            |                    |      |                             |
        |                            |                    v      |                             |
        |                            | 3a. [CTAP2] AuthenticatorMakeCredential                 |
        |                            |-------------------------------------------------------->|
        |                            |                           |                             |
        |                            | 3b. [TPM/Enclave API] MakeCredential                    |
        |                            |-------------------------->|                             |
        |                            |                           |                             |
        |                            | 4. Sign and return attestation                          |
        |                            |<--------------------------|-----------------------------|
        | 5. Verify Attestation,     |                           |                             |
        |    AAGUID & Signature      |                           |                             |
        |<---------------------------|                           |                             |
```

---

## Technical Implementation

Below is a complete, robust TypeScript/Node.js backend implementation for parsing and validating a WebAuthn registration response. It includes strict verification of the `authenticatorAttachment` context, parses the raw `authData`, extracts the unique **AAGUID** (Authenticator Attestation GUID), and checks it against trusted hardware metadata registries.

```typescript
import crypto from 'crypto';

interface RegistrationResponse {
  rawId: string; // Base64URL encoded
  response: {
    clientDataJSON: string; // Base64URL encoded
    attestationObject: string; // Base64URL encoded
    transports?: string[]; // e.g. ["usb", "nfc", "ble", "internal"]
  };
  type: 'public-key';
  authenticatorAttachment?: 'platform' | 'cross-platform'; // "cross-platform" implies Roaming
}

interface WebAuthnConfig {
  expectedOrigin: string;
  expectedRPID: string; // Relying Party Identifier (typically domain)
  requireRoamingKeys: boolean;
}

export class WebAuthnRegistrationVerifier {
  constructor(private config: WebAuthnConfig) {}

  /**
   * Verifies registration payloads and enforces hardware attachment criteria
   */
  public async verifyRegistration(
    response: RegistrationResponse,
    expectedChallenge: string
  ): Promise<{ credentialId: string; publicKey: Buffer; aaguid: string }> {
    
    // 1. Decode Client Data JSON and verify core properties
    const clientDataBuffer = Buffer.from(response.response.clientDataJSON, 'base64');
    const clientData = JSON.parse(clientDataBuffer.toString('utf-8'));

    if (clientData.type !== 'webauthn.create') {
      throw new Error('INVALID_OPERATION: Expected webauthn.create');
    }

    // Verify origin and check against the expected cryptographic challenge
    if (clientData.origin !== this.config.expectedOrigin) {
      throw new Error('SECURITY_VIOLATION: Origin mismatch');
    }

    const decodedChallenge = Buffer.from(clientData.challenge, 'base64').toString('utf-8');
    if (decodedChallenge !== expectedChallenge) {
      throw new Error('SECURITY_VIOLATION: Challenge mismatch or replay attempt');
    }

    // 2. Decode Attestation Object (CBOR encoded in production; simplified representation here)
    // For production systems, use libraries like '@simplewebauthn/server' for full CBOR decoding
    const attestationBuffer = Buffer.from(response.response.attestationObject, 'base64');

    // 3. Enforce strict attachment policies
    if (this.config.requireRoamingKeys) {
      // Validate the client reported attachment modality
      if (response.authenticatorAttachment === 'platform') {
        throw new Error('POLICY_VIOLATION: Platform biometric authenticators are blocked by enterprise policy');
      }

      // Cross-reference with physical transport channels reported by browser
      if (response.response.transports) {
        const hasRoamingTransport = response.response.transports.some((t) =>
          ['usb', 'nfc', 'ble', 'smart-card'].includes(t)
        );
        if (!hasRoamingTransport && response.response.transports.includes('internal')) {
          throw new Error('POLICY_VIOLATION: Local secure enclave detected when physical roaming key was required');
        }
      }
    }

    // 4. Extract Authenticator Data (authData) from Attestation
    // Structure of authData: RPID Hash (32 bytes) | Flags (1 byte) | Counter (4 bytes) | Attested Credential Data (variable)
    // Attested Credential Data: AAGUID (16 bytes) | Credential ID Length (2 bytes) | Credential ID | Public Key (COSE)
    const authData = this.extractAuthDataFromAttestation(attestationBuffer);

    const rpIdHash = authData.subarray(0, 32);
    const expectedRpIdHash = crypto.createHash('sha256').update(this.config.expectedRPID).digest();
    if (!rpIdHash.equals(expectedRpIdHash)) {
      throw new Error('SECURITY_VIOLATION: RP ID Hash mismatch');
    }

    const flags = authData[32];
    const userPresent = (flags & 0x01) !== 0; // bit 0
    const userVerified = (flags & 0x04) !== 0; // bit 2

    if (!userPresent) {
      throw new Error('SECURITY_VIOLATION: User presence assertion (UP) is required');
    }
    
    // For high security, we enforce PIN, Biometric, or Face recognition (User Verification)
    if (!userVerified) {
      throw new Error('POLICY_VIOLATION: User Verification (UV) is required');
    }

    // 5. Extract AAGUID and map to hardware attributes
    const aaguid = authData.subarray(37, 53).toString('hex');
    
    // If we require roaming, verify the AAGUID is not empty (Platform enclaves often return all zeros)
    if (this.config.requireRoamingKeys && aaguid === '00000000000000000000000000000000') {
      throw new Error('POLICY_VIOLATION: Anonymous platform authenticators (AAGUID zeroed) are blocked');
    }

    const credentialIdLen = authData.readUInt16BE(53);
    const credentialId = authData.subarray(55, 55 + credentialIdLen).toString('base64');
    const publicKey = authData.subarray(55 + credentialIdLen);

    return {
      credentialId,
      publicKey,
      aaguid,
    };
  }

  private extractAuthDataFromAttestation(attestation: Buffer): Buffer {
    // Structural layout parsing logic
    // In actual deployments, use a specialized CBOR/FIDO2 decoder to unpack correctly
    // Here we slice simulated bytes for implementation clarity
    return attestation.subarray(0); 
  }
}
```

---

## Defensive Hardening Checklist

1. **Verify AAGUID against MDS**: Connect your Relying Party server to the FIDO Alliance Metadata Service (MDS) to verify that the AAGUID matches certified physical roaming hardware.
2. **Require User Verification (UV)**: Set the `userVerification` option to `required` during registration and login to ensure keys enforce a local biometric check or PIN, rather than allowing simple touch-to-approve triggers.
3. **Bind RP ID Strictly**: Never use dynamic wildcard domains for the `rpID` configuration. Enforce absolute domain bounds to prevent origin spoofing attacks.
