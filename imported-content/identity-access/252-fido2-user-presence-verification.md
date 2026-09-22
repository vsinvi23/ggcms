# FIDO2 Internals: User Presence (UP) vs User Verification (UV) Flags

## The Problem: Distinguishing Between "Someone is there" and "The Right Person is there"

FIDO2 and WebAuthn have revolutionized authentication by replacing phishable passwords with public-key cryptography backed by hardware authenticators (security keys, Touch ID, Windows Hello). 

However, when a Relying Party (a website or application) requests authentication, it must specify *how much* assurance it needs regarding the user interacting with the device. If an employee walks away from an unlocked laptop with a YubiKey plugged in, can a malicious actor simply press the glowing button to authenticate?

This risk model introduces the fundamental distinction in FIDO2 between **User Presence (UP)** and **User Verification (UV)**. Understanding how these flags operate within the Authenticator Data (`authData`) payload is critical for security engineers designing authentication flows.

## The Mental Model: The Bouncer vs. The ID Checker

Think of the authenticator as physical security at a high-security facility.

*   **User Presence (UP) is the Bouncer:** The bouncer asks, "Are you a living, breathing human currently standing at this door?" A simple tap, button press, or plugging in a device satisfies this. The bouncer doesn't care *who* you are, just that you are physically present right now. This prevents malware from remotely triggering the authenticator without physical interaction.
*   **User Verification (UV) is the ID Checker:** The ID checker demands, "Prove to me exactly *who* you are." This requires a biometric check (fingerprint, FaceID) or a localized PIN known only to the authorized user. It verifies the identity of the specific human present.

```mermaid
graph TD
    A[Authentication Request] --> B{What does the Relying Party require?}
    B -->|UP Only (User Presence)| C[User taps YubiKey button]
    B -->|UV Required (User Verification)| D[User enters PIN or scans fingerprint]
    
    C --> E[Prevents: Remote Malware Triggers]
    C -.-> F[Vulnerable to: Physical access by unauthorized user]
    
    D --> G[Prevents: Remote Malware + Physical Unauthorized Access]
    D --> H[Provides: True Multi-Factor Authentication in a single step]
```

## Implementation Deep Dive: The `authData` Flags

During a WebAuthn ceremony (specifically, `navigator.credentials.get()`), the authenticator generates a cryptographically signed assertion. A core component of this assertion is the `authData` byte array.

The first byte of the `authData` contains bit flags that encode the state of the authenticator during the operation.

*   **Bit 0 (UP - User Presence):** Set to `1` if the user physically interacted with the device.
*   **Bit 2 (UV - User Verification):** Set to `1` if the authenticator successfully verified the user (via PIN or biometrics).

### Relying Party Configuration

When the application requests authentication, it dictates its requirements using the `userVerification` property in the `publicKey` options object:

```javascript
const publicKeyCredentialRequestOptions = {
    challenge: Uint8Array.from("random_challenge_data_here", c => c.charCodeAt(0)),
    allowCredentials: [{
        id: credentialId,
        type: 'public-key',
    }],
    timeout: 60000,
    // THE CRITICAL DECISION POINT:
    // 'required': Authenticator MUST perform UV. If it can't (no PIN/bio), it fails.
    // 'preferred': Do it if you can, otherwise fall back to UP only.
    // 'discouraged': Don't bother with PIN/bio, just check UP (button press).
    userVerification: 'required' 
};

navigator.credentials.get({
    publicKey: publicKeyCredentialRequestOptions
})
```

### Backend Validation

The backend server receiving the assertion *must* validate these flags mathematically. If you requested `userVerification: 'required'`, but fail to check the UV bit in the response, you are vulnerable to downgrade attacks.

```python
# Conceptual Python backend validation
def verify_auth_data(auth_data_bytes, required_uv):
    # The flags are the 33rd byte (index 32) of the authData
    flags = auth_data_bytes[32]
    
    # Bitwise AND to check specific flags
    UP_FLAG = 0x01  # Bit 0
    UV_FLAG = 0x04  # Bit 2
    
    is_up_set = bool(flags & UP_FLAG)
    is_uv_set = bool(flags & UV_FLAG)
    
    if not is_up_set:
        raise SecurityException("User Presence flag not set. Possible remote attack.")
        
    if required_uv and not is_uv_set:
        raise SecurityException("User Verification was required but not performed!")
        
    return True
```

## Security Strategy: When to use UP vs UV

1.  **Multi-Factor Authentication (MFA) Step-Up:** If the user has already entered a strong password (Factor 1: Knowledge), requiring only **UP** on a hardware key (Factor 2: Possession) is an acceptable, low-friction pattern.
2.  **Passwordless Authentication:** If you are eliminating passwords entirely, you **MUST require UV**. If you only require UP, anyone who finds the user's laptop and security key can log in. UV ensures the authenticator provides both Possession (the key) and Knowledge/Inherence (the PIN/biometric).
3.  **High-Value Actions:** For transferring funds or changing security settings, enforce `userVerification: 'required'` even in an active session to prevent a physical attacker from hijacking an unattended workstation.

By rigorously enforcing the UV flag on the backend, security engineers transform simple possession-based tokens into true, mathematically verifiable multi-factor authenticators.