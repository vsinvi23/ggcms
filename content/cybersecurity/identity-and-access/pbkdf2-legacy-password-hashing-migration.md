---
title: "Migrating Legacy PBKDF2 Password Hashing to Argon2id"
description: "How to recognize a dangerously under-configured legacy PBKDF2 password store (weak iteration counts, static salts) and migrate it to Argon2id with a transparent rehash-on-login strategy."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "pbkdf2"
  - "password-hashing"
  - "argon2"
  - "salt"
  - "rehash-on-login"
  - "credential-migration"
---

# Migrating Legacy PBKDF2 Password Hashing to Argon2id

## The Problem: A Decade-Old PBKDF2 Config Nobody Revisited

A common production incident: a security review of a five-year-old application finds user passwords stored with PBKDF2-HMAC-SHA256, but the iteration count was set once, at launch, to `10,000` — the library default at the time — and never revisited. Worse, some tables share a single application-wide salt constant instead of a unique salt per row.

Neither problem is visible from the outside. The login flow works fine. The risk only becomes obvious the day the database leaks: a static salt means every user with the same password produces the identical hash, so an attacker who cracks one common password instantly identifies every other account using it (and can precompute a rainbow table once, reuse it forever). A low iteration count means each guess is cheap — modern GPU rigs compute PBKDF2-HMAC-SHA256 fast enough that 10,000 iterations offers only weak protection against a wordlist attack, well below current OWASP guidance (currently around 600,000 iterations for PBKDF2-HMAC-SHA256, and rising as hardware improves).

```
[Weak Hashing: Fast & Vulnerable]
Password ---------------------> [ SHA-256 ] ---------------------> Fast Hash (crackable in microseconds)

[Salted Iterative Hashing: Better, still GPU-parallelizable]
Password + Global Salt -------> [ PBKDF2, 10,000 iterations ] ----> Iterated Hash (slow, but embarrassingly parallel on GPUs)

[Modern Memory-Hard Hashing: GPU-resistant]
Password + Unique Salt -------> [ Argon2id (memory + time hard) ] -> Argon2id Hash (parallelism is capped by VRAM, not core count)
```

PBKDF2 is purely CPU-bound — an attacker can run millions of PBKDF2 calculations in parallel across GPU cores because each one needs almost no memory. Argon2id (RFC 9106) is *memory-hard*: each hashing thread must occupy a real block of RAM, so a GPU with a few gigabytes of VRAM can only run a handful of instances at once, no matter how many cores it has.

## Step 1: Recognize the Anti-Patterns in the Existing Code

A minimal, deliberately weak PBKDF2 implementation looks like this — the kind you find bolted onto a legacy auth module:

```python
import hashlib
import os

# ANTI-PATTERN: static, application-wide salt reused for every user
LEGACY_GLOBAL_SALT = b"static-app-salt-do-not-use"

def legacy_hash_password(password: str) -> str:
    # ANTI-PATTERN: iteration count far below current OWASP guidance
    dk = hashlib.pbkdf2_hmac(
        "sha256",
        password.encode("utf-8"),
        LEGACY_GLOBAL_SALT,
        10_000,  # too low for 2026 GPU capabilities
    )
    return dk.hex()
```

Two defects: the salt is a compile-time constant, and `10_000` iterations is roughly two orders of magnitude below current OWASP recommendations for PBKDF2-HMAC-SHA256. Neither defect throws an error or fails a test — the login flow works — which is exactly why these configurations survive for years.

## Step 2: Migrate to Argon2id with a Rehash-on-Login Strategy

You cannot bulk-rehash a password table you don't have the plaintexts for. The standard migration path is to verify against the *old* scheme at login time, and — on a successful login — silently re-hash the password with the new scheme before the next read.

```python
import hashlib
import hmac
from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError

ph = PasswordHasher(
    time_cost=3,
    memory_cost=65536,  # 64 MB
    parallelism=4,
    hash_len=32,
    salt_len=16,
)


def verify_legacy_pbkdf2(password: str, stored_salt: bytes, stored_hash_hex: str, iterations: int) -> bool:
    """Verifies a password against a legacy per-user-salted PBKDF2 hash."""
    candidate = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), stored_salt, iterations)
    return hmac.compare_digest(candidate.hex(), stored_hash_hex)


def login_and_migrate(user_record: dict, entered_password: str) -> tuple[bool, str | None]:
    """
    Verifies the entered password against whichever scheme the stored record uses.
    Returns (is_valid, new_argon2_hash_or_None). Caller persists new_argon2_hash
    and clears the legacy fields only when a value is returned.
    """
    if user_record["scheme"] == "argon2id":
        try:
            ph.verify(user_record["hash"], entered_password)
            if ph.check_needs_rehash(user_record["hash"]):
                return True, ph.hash(entered_password)
            return True, None
        except VerifyMismatchError:
            return False, None

    if user_record["scheme"] == "pbkdf2_sha256":
        if len(entered_password) < 8:
            return False, None
        ok = verify_legacy_pbkdf2(
            entered_password,
            user_record["salt"],
            user_record["hash"],
            user_record["iterations"],
        )
        if ok:
            # Successful login on the legacy scheme: upgrade transparently
            return True, ph.hash(entered_password)
        return False, None

    raise ValueError(f"Unknown password scheme: {user_record['scheme']}")
```

The caller (your auth service) treats a non-`None` second return value as "persist this new Argon2id hash and update `scheme` to `argon2id`, then delete the legacy `salt`/`iterations` fields for that row." Users who never log in again keep their legacy hash until they do — which is the correct trade-off, since you have no way to force-migrate a hash you cannot reverse.

## Attack Vectors This Migration Closes

1. **Rainbow Table Lookups**: a static or missing salt means identical passwords produce identical hashes across users, letting an attacker precompute a table once and reuse it against the whole database. Argon2id's per-call random salt (handled internally by `ph.hash`) eliminates this.
2. **GPU-Accelerated Offline Cracking**: PBKDF2-HMAC-SHA256 is CPU-bound math with negligible memory use, so GPU rigs (via Hashcat) parallelize it across thousands of cores. Below-guidance iteration counts make this worse. Argon2id's memory-hard design caps how many parallel instances fit in a GPU's VRAM regardless of core count.
3. **ASIC-Accelerated Cracking**: for pure CPU-bound algorithms like PBKDF2, custom ASICs can be built to outrun even GPUs. Memory-hardness is the specific property that neutralizes this class of hardware.

## Best Practices

- **Prefer Argon2id** for all new development; fall back to bcrypt (work factor 10–12) only if Argon2id is unavailable in your runtime.
- **Always generate salts with a CSPRNG**, unique per user — never a shared constant, and never derived from user-controllable data (e.g. username).
- **Enforce a maximum password length before hashing** (64–128 characters is typical) to prevent a trivial DoS where an attacker submits megabytes of input into the hashing function.
- **Log and monitor rehash events** during the migration window — an unexpected spike or a total absence of `argon2id` upgrades over time both indicate something is wrong with the login path.
