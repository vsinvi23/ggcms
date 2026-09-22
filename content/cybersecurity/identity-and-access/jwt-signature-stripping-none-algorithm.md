---
title: "JWT Signature Stripping: Defeating the `alg: none` Attack"
description: "How naive JWT libraries get tricked into accepting unsigned tokens via the 'none' algorithm, why algorithm confusion attacks exist, and how to lock down verification in Node.js."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "jwt"
  - "alg-none"
  - "signature-stripping"
  - "algorithm-confusion"
  - "rfc-7519"
---

# JWT Signature Stripping: Defeating the `alg: none` Attack

JWTs contain three Base64URL-encoded components separated by dots: a Header (metadata including the signing algorithm), a Payload (claims), and a Signature (integrity proof). The oldest and still most recurring flaw in bespoke JWT authentication code is the **signature stripping** attack, built around the `none` algorithm — a scenario where an attacker can bypass cryptographic verification entirely and forge any claim they like, including elevated roles.

## The Problem: Stateless Authentication Without Verification

In a stateless JWT architecture, the server trusts the payload *because* it has verified the signature using a shared secret or public key. Verification logic determines which algorithm to use by reading the `alg` field from the token's own header — `HS256`, `RS256`, `ES256`, and so on.

RFC 7519 also defines a controversial mandatory-to-implement value: `none`. This represents an intentionally unsigned token, meant only for environments where integrity is guaranteed some other way (e.g. inside an already-authenticated internal channel). If a verification library naively trusts whatever `alg` the incoming token claims, it can be tricked into treating a forged, unsigned token as fully verified.

## Attack Walkthrough: From Signed Token to Forged Admin

Start with a legitimate signed token:

- Header: `{"alg": "HS256", "typ": "JWT"}`
- Payload: `{"user": "alice", "role": "user"}`
- Signature: `[valid HMAC signature]`

The attacker:

1. Decodes the header and changes `"alg"` to `"none"`.
2. Decodes the payload and changes `"role": "user"` to `"role": "admin"`.
3. Re-encodes both segments to Base64URL.
4. Reassembles the token as `header.payload.` — header and payload joined by a dot, followed by a trailing dot representing an empty signature (e.g. `eyJhbGciOiJub25lIiwidHlwIjoiSldUIn0.eyJ1c2VyIjoiYWRtaW4iLCJyb2xlIjoiYWRtaW4ifQ.`).

If the verification library reads `alg: none` from the (unverified) header and dynamically decides "no signature check needed," it accepts the forged payload outright.

## The Vulnerable Pattern

```javascript
// VULNERABLE — decodes without verifying signature
const token = req.headers.authorization.split(' ')[1];
const decoded = jwt.decode(token);

// Also vulnerable if verify() lets the token's own header pick the algorithm
const verified = jwt.verify(token, secretKey);
```

If `verify()` doesn't pin an explicit algorithm allow-list, a library that dynamically switches on the header's `alg` will honor `none` (or, historically, case variants like `None`/`NONE` that slipped past naive string equality checks in older parsers).

## The Fix: Hard-Code Allowed Algorithms

Never let the token's own header decide which algorithm verification uses. Pass an explicit list to the verify call and let the library reject anything else, including `none`:

```javascript
// SECURE — Node.js, jsonwebtoken library
const jwt = require('jsonwebtoken');

try {
    const token = req.headers.authorization.split(' ')[1];

    // Explicitly enforce HS256 only. The library throws if "alg" is
    // "none" or anything not in this list.
    const decoded = jwt.verify(token, process.env.JWT_SECRET, {
        algorithms: ['HS256']
    });

    req.user = decoded;
} catch (err) {
    res.status(401).send('Invalid or unauthenticated token');
}
```

## A Correct Validation Pipeline

Regardless of language or library, the sequence must be:

1. Parse the token structure — exactly three dot-separated parts.
2. Verify the signature against your key/secret, using an algorithm **you** chose, never one read from the token.
3. Only after step 2 succeeds, read and trust the payload's claims.

Reversing steps 2 and 3 — reading claims before (or instead of) verifying — is exactly the mistake that makes signature stripping possible.

## Developer Takeaways

- **Stateless does not mean unverified.** A JWT payload is fully readable by anyone holding the token; the signature protects against tampering, not against disclosure.
- **Disable `none` globally**, in every backend service that verifies tokens — don't assume it's disabled by default in every library or configuration.
- **Statically define your algorithm allow-list** (e.g. `['RS256']`) on every verification call; never derive it from the token.
- **Watch for the sibling bug — algorithm confusion.** If your service accepts both `RS256` and `HS256` and uses the *same* configured value as both the RSA public key and the HMAC secret, an attacker who knows your public key (which is, by design, public) can sign an `HS256` token using that public key as the shared secret. The fix is the same discipline: verify only the algorithm the key material is actually meant for, never let the token pick.
