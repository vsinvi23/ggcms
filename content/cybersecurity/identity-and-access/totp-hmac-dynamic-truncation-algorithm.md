---
title: "TOTP Under the Hood: HMAC Dynamic Truncation Math for MFA Codes"
description: "How an offline authenticator app and a remote server independently compute the same 6-digit code every 30 seconds, walked through step by step -- time discretization, HMAC-SHA1, dynamic truncation -- with a working Python implementation."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "mfa"
  - "totp"
  - "hotp"
  - "rfc-6238"
  - "hmac"
  - "authenticator-apps"
---

# TOTP Under the Hood: HMAC Dynamic Truncation Math for MFA Codes

## The Problem: Cryptographic Synchronization Without Connectivity

SMS-based MFA is vulnerable to SIM-swapping; email OTPs depend on a channel an attacker who's already phished credentials can often also compromise. Authenticator apps (Google Authenticator, Authy, Yubico apps) solve this differently: they generate a 6-digit code entirely offline, with zero network communication at the moment of login.

That raises a genuine engineering question: how can a smartphone with no network connection, and a server on the other side of the internet, independently arrive at the *exact same* 6-digit number, at the exact same moment, without either one ever telling the other what it computed? The answer has to be deterministic, resistant to prediction by an eavesdropper, and cheap enough to run on a decade-old phone. That's TOTP — RFC 6238, built on top of HOTP (RFC 4226).

## Mental Model: Deterministic Time-Slicing

TOTP turns a shared secret key and the current time into a deterministic digit sequence. Time is divided into fixed windows (30 seconds is standard); as long as both sides hold the same secret and roughly synchronized clocks, they compute identical output for the entire window.

```
[ Shared Secret Key (K) ] + [ Current Epoch Time / 30 (T) ]
                       |
                       v
               [ HMAC-SHA1 Engine ]
                       |
                       v
         [ 20-Byte Raw Cryptographic Hash ]
                       |
                       v
         [ Dynamic Truncation & Extract ]
                       |
                       v
          [ 6-Digit Numeric Code ]
```

## Setup and Authentication Flow

```text
  [MFA Setup]
  1. Server generates a random Base32 secret: JBSWY3DPEHPK3PXP
  2. Server displays a QR code: otpauth://totp/App?secret=...
  3. Authenticator app scans the QR code and stores the secret.

  [Authentication]
  Authenticator App (offline)                        Auth Server
      |                                                    |
      |-- Current Unix time = 1774000000                   |-- Current Unix time = 1774000000
      |-- Time step (T) = 1774000000 / 30                  |-- Time step (T) = 1774000000 / 30
      |-- Hash = HMAC-SHA1(secret, T)                       |-- Hash = HMAC-SHA1(secret, T)
      |-- Offset = Hash[19] & 0x0F                          |-- Offset = Hash[19] & 0x0F
      |-- Code = Hash[offset..offset+3] % 10^6              |-- Code = Hash[offset..offset+3] % 10^6
      |                                                    |
      |--- Sends 6-digit code: "492031" ------------------>|
                                                           |--- Compares "492031" == "492031"
```

## The Cryptographic Engine, Step by Step

### Step 1 — Discretize the Time

The current Unix epoch time (seconds) is divided by the time-step interval `X` (typically 30) with the remainder discarded, so the result stays constant across the whole window:

```
T = floor((CurrentTime - T0) / X)
```

`T0` is 0 (the Unix epoch start); `T` is packed as an 8-byte big-endian integer for the HMAC input.

### Step 2 — Compute the HMAC

```
HS = HMAC-SHA1(K, T)
```

This produces a 20-byte (160-bit) hash — far too long to type into a login form.

### Step 3 — Dynamic Truncation

Rather than just taking the first few bytes (which would introduce statistical bias), the algorithm picks a *data-dependent* starting offset:

1. Take the last byte of the 20-byte hash; mask it with `0x0F` to get a value 0–15 — this is the `offset`.
2. Read 4 consecutive bytes from the hash starting at `offset`.
3. Mask the most significant bit of that 4-byte value with `0x7F` so the result is always a positive 31-bit integer (avoids signed-integer inconsistencies across platforms).

```
Hash bytes:  [ ... byte[12] byte[13] byte[14] byte[15] ... byte[19] ]
                                                              ^
                                                    last nibble = offset (e.g. 12)
Read 4 bytes starting at offset 12: [ B5 C8 D9 E2 ]
Mask top bit:                       [ 35 C8 D9 E2 ]  -> decimal 902355426
```

### Step 4 — Modulo to Get a 6-Digit Code

```
TOTP = BinaryInteger mod 10^6
```

Pad with leading zeros if needed, e.g. `355426`.

## Python Implementation

```python
import hmac
import hashlib
import time
import base64
import struct

def generate_totp(secret_base32: str, time_step: int = 30, digits: int = 6) -> str:
    # 1. Decode the shared secret from its Base32 QR-code encoding.
    secret_bytes = base64.b32decode(secret_base32, casefold=True)

    # 2. Time counter T: Unix epoch seconds divided by the step interval.
    current_time = int(time.time())
    counter = int(current_time / time_step)

    # 3. Pack T as an 8-byte big-endian integer, as HMAC expects.
    counter_bytes = struct.pack(">Q", counter)

    # 4. HMAC-SHA1 over the secret and the time counter -> 20-byte digest.
    hmac_hash = hmac.new(secret_bytes, counter_bytes, hashlib.sha1).digest()

    # 5. Dynamic truncation.
    offset = hmac_hash[-1] & 0x0F
    (sliced_int,) = struct.unpack(">I", hmac_hash[offset:offset + 4])
    truncated_hash = sliced_int & 0x7FFFFFFF

    # 6. Reduce to the requested digit count.
    code = truncated_hash % (10 ** digits)

    # 7. Zero-pad for display.
    return f"{code:0{digits}d}"

# generate_totp("JBSWY3DPEHPK3PXP") -> a fresh 6-digit code, valid for the current 30s window
```

## Engineering Considerations

1. **Clock drift and lookahead windows.** Phone clocks drift, especially offline. If drift exceeds the time-step window, client and server compute different `T` values and legitimate logins fail. Servers should verify against `T-1`, `T`, and `T+1` (a ±30-second window) to tolerate minor drift — but widening this window further trades usability for a larger replay-acceptance window, so don't over-extend it.
2. **Replay protection within the same window.** Because a code stays valid for the full 30-second step, an attacker who captures a code in transit (e.g. shoulder-surfing, a compromised proxy) can replay it until the window closes. Servers should cache `(user_id, counter)` on first successful use and reject any subsequent attempt with the same counter value, even if the code itself is technically still "current."
3. **Adversary-in-the-middle (AitM) phishing.** Tools like Evilginx proxy the entire login flow, including the TOTP prompt: the victim types their real code into the phishing page, which relays it to the real IdP within the validity window and steals the resulting session cookie. TOTP's math is sound; it simply doesn't bind the code to a specific origin. The structural fix is phishing-resistant MFA — FIDO2/WebAuthn — which cryptographically ties the credential exchange to the exact browser origin, something no OTP-based scheme (SMS, email, or TOTP) can do.
4. **Secret storage.** The shared secret is equivalent to a long-term password — encrypt it at rest (KMS/HSM-backed), and lock down the endpoint that serves the enrollment QR code as tightly as any credential-issuing endpoint, since anyone who captures that QR code can generate valid codes forever without ever touching the user's device again.

Note: sources referenced `struct.pack(">Q", counter)` (an 8-byte unsigned integer) for the HMAC message, matching RFC 4226's `C` (moving factor) — some implementations instead pass the counter as a plain big-endian byte string of the same length; either is correct as long as client and server agree.
