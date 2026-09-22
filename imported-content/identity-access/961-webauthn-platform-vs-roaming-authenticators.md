# WebAuthn: Platform vs Roaming Authenticators and CTAP2 Protocol Handshakes

## The Problem
Traditional passwords and SMS OTPs are inherently vulnerable to phishing. Web Authentication (WebAuthn) eliminates this by utilizing public key cryptography. However, developers integrating WebAuthn frequently struggle with the distinction between Platform Authenticators (Touch ID, Face ID, Windows Hello) and Roaming Authenticators (YubiKeys), leading to confusing user experiences and improper protocol implementations across different devices.

## Platform vs Roaming Authenticators
- **Platform Authenticators**: Embedded directly into the user's device (e.g., MacBook's Touch ID, Android's fingerprint sensor). They are bound to a specific hardware device and cannot be moved.
- **Roaming Authenticators**: Detachable devices (e.g., USB security keys, Bluetooth/NFC tokens) that can be carried between different computers and mobile devices.

```text
+-----------------------+           +-----------------------+
|  Platform Auth        |           |  Roaming Auth         |
|  (Bound to Device)    |           |  (Cross-Device)       |
|                       |           |                       |
|  [ Laptop / Phone ]   |   CTAP2   |  [ YubiKey / Token ]  |
|      +-----+          | <=======> |       +-----+         |
|      | TPM |          |    USB    |       | SE  |         |
|      +-----+          |  NFC/BLE  |       +-----+         |
+-----------------------+           +-----------------------+
```

## The CTAP2 Protocol Handshake
Client to Authenticator Protocol (CTAP2) is the bridge between the browser (the WebAuthn client) and the authenticator. When the server requests a credential, the browser uses CTAP2 to instruct the authenticator to generate a keypair or assert a signature.

1. **Relying Party (Server)** sends a challenge, RP ID, and user data.
2. **Browser** receives the payload and invokes the WebAuthn API (`navigator.credentials.create()`).
3. **CTAP2 Interaction**: The browser serializes the data into CBOR (Concise Binary Object Representation) and sends a `authenticatorMakeCredential` command to the authenticator.
4. **User Consent**: The authenticator blinks or prompts for biometric verification (User Presence/Verification).
5. **Key Generation**: The authenticator generates an asymmetric keypair, storing the private key securely in its Secure Enclave (SE) or Trusted Platform Module (TPM).
6. **Response**: The public key and attestation object are returned via CTAP2 to the browser, which forwards them to the server.

## Directing the User Experience (AuthenticatorAttachment)
When initiating registration, you must specify the `authenticatorAttachment` property. Leaving this undefined leaves the decision up to the browser, which often results in confusing prompts.

### Registration Strategy
```javascript
const publicKeyCredentialCreationOptions = {
    challenge: Uint8Array.from("random-server-challenge-string", c => c.charCodeAt(0)),
    rp: {
        name: "Acme Corp",
        id: "acme.com",
    },
    user: {
        id: Uint8Array.from("user_id_123", c => c.charCodeAt(0)),
        name: "alice@acme.com",
        displayName: "Alice",
    },
    pubKeyCredParams: [{alg: -7, type: "public-key"}], // ES256
    
    // CRITICAL: Direct the user's hardware
    authenticatorSelection: {
        // "platform" forces TouchID/Windows Hello
        // "cross-platform" forces a YubiKey/Roaming Token
        authenticatorAttachment: "cross-platform", 
        
        // "required" forces biometric/PIN verification, "preferred" falls back to simple touch
        userVerification: "required",
        
        // "required" makes the key a Discoverable Credential (Passkey)
        residentKey: "preferred" 
    },
    timeout: 60000,
};

navigator.credentials.create({
    publicKey: publicKeyCredentialCreationOptions
}).then((newCredential) => {
    // Send newCredential to server
});
```

## Security Posture
- **Phishing Resistance**: WebAuthn binds the key to the `rp.id` (the domain). A credential generated for `acme.com` will mathematically fail to assert if the user is tricked into visiting `acnne.com`.
- **User Verification (UV) vs User Presence (UP)**: UV confirms *who* the user is (biometrics, PIN). UP merely confirms a human is present (touching a flashing key). For high-security endpoints, enforce `userVerification: 'required'`.
