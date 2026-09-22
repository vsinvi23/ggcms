# MFA Security: Inside the TOTP (Time-Based One-Time Password) HMAC Truncation Math

## The Problem: Securely Generating Offline Codes
Multi-Factor Authentication (MFA) is essential for mitigating credential stuffing and phishing. While SMS and email OTPs are vulnerable to SIM swapping and network interception, authenticator apps (like Google Authenticator or Authy) provide robust offline token generation. 

The challenge: How do an offline smartphone and a remote authentication server independently generate the exact same 6-digit code at the exact same time, without ever communicating over the network, while ensuring the codes cannot be predicted by an attacker?

## The Solution: RFC 6238 (TOTP) and RFC 4226 (HOTP)
The solution is the Time-Based One-Time Password (TOTP) algorithm. It relies on a shared symmetric secret key established during setup (usually via a QR code) and the current Unix time.

TOTP is built on top of HOTP (HMAC-based One-Time Password). Instead of using an incrementing event counter, TOTP uses a time window (usually 30 seconds) as the counter.

The magic lies in the **Dynamic Truncation** algorithm. An HMAC-SHA1 signature produces a 20-byte (160-bit) hash. We need to convert this massive byte array into a user-friendly 6-digit number, evenly distributed and cryptographically secure. We cannot just take the first 6 digits, as that would introduce bias.

## Architectural Flow
```text
  [MFA Setup]
  1. Server generates random Base32 Secret: JBSWY3DPEHPK3PXP
  2. Server displays QR Code: otpauth://totp/App?secret=...
  3. Client App scans QR and saves Secret securely.

  [Authentication]
  Client App (Offline)                              Auth Server
      |                                                |
      |-- Current Unix Time = 1715000000               |-- Current Unix Time = 1715000000
      |-- Time Step (T) = 1715000000 / 30              |-- Time Step (T) = 1715000000 / 30
      |-- Hash = HMAC-SHA1(Secret, T)                  |-- Hash = HMAC-SHA1(Secret, T)
      |-- Offset = Hash[19] & 0x0F                     |-- Offset = Hash[19] & 0x0F
      |-- Code = Hash[Offset...Offset+3] % 10^6        |-- Code = Hash[Offset...Offset+3] % 10^6
      |                                                |
      |--- Sends 6-digit code: "492031" -------------->|
                                                       |--- Verifies "492031" == "492031"
```

## Implementation: The Truncation Math (Python)
To understand dynamic truncation, we must look at the bitwise operations that extract a 31-bit integer from the 20-byte HMAC output.

```python
import hmac
import hashlib
import time
import base64
import struct

def generate_totp(secret_base32: str, time_step: int = 30, digits: int = 6) -> str:
    # 1. Decode the shared secret
    secret_bytes = base64.b32decode(secret_base32, casefold=True)
    
    # 2. Calculate the time counter (T)
    # Unix epoch time divided by the step (default 30 seconds)
    current_time = int(time.time())
    counter = int(current_time / time_step)
    
    # 3. Pack the counter into an 8-byte big-endian format expected by HMAC
    counter_bytes = struct.pack(">Q", counter)
    
    # 4. Generate the HMAC-SHA1 hash
    # Output is a 20-byte digest
    hmac_hash = hmac.new(secret_bytes, counter_bytes, hashlib.sha1).digest()
    
    # 5. DYNAMIC TRUNCATION ALGORITHM (The Magic)
    # Grab the very last byte of the 20-byte hash
    # Use bitwise AND 0x0F to mask it down to the lower 4 bits (values 0-15)
    offset = hmac_hash[-1] & 0x0F
    
    # Extract 4 bytes starting at the calculated offset
    # Unpack as a big-endian unsigned integer (I)
    (sliced_int,) = struct.unpack(">I", hmac_hash[offset:offset + 4])
    
    # Mask the most significant bit (MSB) to avoid issues with signed integer 
    # interpretation across different systems. This leaves us with a 31-bit number.
    truncated_hash = sliced_int & 0x7FFFFFFF
    
    # 6. Modulo operation to get the desired number of digits
    code = truncated_hash % (10 ** digits)
    
    # 7. Pad with leading zeros if necessary
    return f"{code:0{digits}d}"

# Example Usage
# Secret: "JBSWY3DPEHPK3PXP"
# Code: generate_totp("JBSWY3DPEHPK3PXP")
```

## Engineering Considerations
1. **Clock Drift and Lookahead Windows:** Server clocks and mobile phone clocks are rarely perfectly synchronized. Authentication servers must implement a "lookahead/lookbehind" window. When verifying a code, the server should calculate the TOTP for `T - 1`, `T`, and `T + 1`. If any match, the code is accepted.
2. **Replay Protection:** To prevent an attacker from intercepting a TOTP code and re-using it within the same 30-second window, the server must cache the combination of `(User ID, Counter)` upon successful authentication and reject subsequent attempts using the same counter.
3. **Secret Storage:** The shared symmetric secret is the keys to the kingdom. It must be encrypted at rest in the database using KMS/HSM, and the endpoint providing the QR code must be strictly protected against unauthorized access.