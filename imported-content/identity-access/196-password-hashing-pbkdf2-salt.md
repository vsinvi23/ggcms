# Legacy Password Hashing: The Risks of PBKDF2 and the Importance of Unique Salts

## The Problem
Many legacy production applications still secure user passwords using obsolete algorithms such as MD5, SHA-1, or unsalted SHA-256. Worse, some that attempted to modernize adopted PBKDF2 (Password-Based Key Derivations Function 2) but implemented it with globally static salts or dangerously low iteration counts (such as the legacy default of 1,000 iterations). 

In the era of cheap cloud computing and highly parallelized consumer GPUs, these weak cryptographic implementations are a massive security liability. If a database is leaked or stolen, an attacker can launch incredibly fast offline brute-force and dictionary attacks. Standard cryptographic hash functions (like SHA-256) are optimized for speed, which is the exact opposite of what you want for password storage. Without high-entropy, unique cryptographic salts and computationally expensive algorithms, stolen password databases can be cracked in minutes, exposing users to systemic credential stuffing attacks across other web platforms.

## The Mental Model
The strength of a password hashing mechanism lies in its mathematical complexity, its resistance to parallelization, and its uniqueness across records.

```
[Weak Hashing: Fast & Vulnerable]
Password ---------------------> [ SHA-256 ] ---------------------> Fast Hash (Crackable in microseconds)

[Salted Iterative Hashing: Slightly Better but GPU-vulnerable]
Password + Global Salt -------> [ PBKDF2 (10,000 Iterations) ] ---> Iterated Hash (Slow, but highly parallelizable on GPUs)

[Modern Memory-Hard Hashing: Phishing & GPU Resistant]
Password + Unique Salt -------> [ Argon2id (Memory + Time Hard) ] -> Secure Argon2id Hash (Blocks GPU acceleration)
```

While PBKDF2 slows down password checking by iterating a HMAC function, it is purely CPU-bound. Modern GPUs can run millions of PBKDF2 calculations in parallel. Modern password hashing standards—such as Argon2id (RFC 9106)—are designed to be "memory-hard," forcing the hashing thread to occupy physical RAM blocks. This makes GPU-based cracking prohibitively expensive and slow.

## Attack Vectors
1. **Rainbow Table Lookups**: If a database lacks unique cryptographic salting (meaning all users share a global system salt or no salt at all), two users with the same password will have the exact same hash value. Attackers can precompute hashes for millions of common passwords (a "rainbow table") and instantly look up plaintexts from the stolen hashes.
2. **GPU-Accelerated Offline Cracking**: Attackers compile customized cracking rigs (using hashcat) that utilize thousands of GPU cores to compute PBKDF2 SHA-256 hashes. If the PBKDF2 iteration count is set below recommended OWASP levels (currently 600,000 for PBKDF2-HMAC-SHA256), a high-density GPU cluster can crack millions of passwords in a matter of hours.
3. **ASIC Custom Cracking**: For pure CPU-bound algorithms like PBKDF2, custom Application-Specific Integrated Circuits (ASICs) can be built to calculate hashes even faster than GPUs, leaving user credentials highly exposed in the event of a database compromise.

## Defensive Architecture
To protect credentials, legacy systems must transition to memory-hard hashing algorithms like Argon2id.

### Python: Upgrading Legacy Hashes to Argon2id
The following Python script illustrates how to securely hash passwords using the enterprise-recommended `argon2-cffi` library, enforcing custom memory, time, and parallelism parameters.

```python
import os
import secrets
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

# We initialize the Argon2id hasher with secure, modern parameter configurations
# m=65536: Requires 64MB of RAM to prevent GPU/ASIC acceleration
# t=3: Runs 3 iterations over the memory blocks
# p=4: Utilizes 4 parallel threads
ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,
    parallelism=4,
    hash_len=32,
    salt_len=16
)

def secure_hash_password(plain_password: str) -> str:
    """
    Generates a cryptographically secure, salted Argon2id hash.
    The salt is randomly generated automatically by the library for each call.
    """
    if len(plain_password) < 8:
        raise ValueError("Password must be at least 8 characters long")
    
    # Generate the Argon2id hash
    return ph.hash(plain_password)

def verify_and_migrate_password(stored_hash: str, entered_password: str) -> bool:
    """
    Verifies the password against the stored hash.
    Can be used to dynamically check and upgrade legacy hashes during user login.
    """
    try:
        # Check if the entered password matches the stored Argon2id hash
        ph.verify(stored_hash, entered_password)
        
        # Check if the stored hash parameters are outdated and need rehashing (re-tuning)
        if ph.check_needs_rehash(stored_hash):
            print("Upgrading password hash parameters...")
            # Return True but flag the system to update the hash in the database
            
        return True
    except VerifyMismatchError:
        return False
```

## Best Practices
- **Adopt Argon2id**: Always prefer Argon2id for new developments, falling back to bcrypt (with a work factor of 10-12) if Argon2id is unavailable in your environment.
- **Ensure Unique Salt Generation**: Always use a cryptographically secure random number generator (CSRNG) to generate high-entropy, unique salts per-user.
- **Set Long Max Limits**: Enforce a reasonable password length limit (such as 64-128 characters) but check the length before hashing to prevent DoS attacks that feed gigabytes of text into the hashing engine.
