---
title: "SSL Stripping and Downgrade Attacks: How HSTS Fixes the Flaw"
description: "How SSL stripping silently downgrades HTTPS connections to plaintext HTTP, and how HTTP Strict Transport Security (HSTS) and preloading close the gap."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "ssl-stripping"
  - "hsts"
  - "downgrade-attack"
  - "man-in-the-middle"
  - "hsts-preload"
---

# SSL Stripping and Downgrade Attacks: How HSTS Fixes the Flaw

Cryptographic protocols are useless if an attacker can intercept the initial HTTP request and prevent the transition to HTTPS from ever happening, leaving the entire connection in plaintext. This is the exact gap that SSL stripping attacks exploit, and it existed for years before browsers had a real fix.

## The Anatomy of an SSL Stripping Attack

SSL stripping — famously demonstrated by Moxie Marlinspike's `sslstrip` tool — is a Man-in-the-Middle (MitM) attack that targets the user's *initial* interaction with a web application, before any encryption has been negotiated.

Most users do not type `https://bank.com`; they type `bank.com`. The browser defaults to an unencrypted HTTP request on port 80, and the server typically responds with a `301 Moved Permanently` redirect to the HTTPS version. That first plaintext request is the entire attack surface.

**The attack execution:**

1. **Interception** — The MitM attacker intercepts the victim's initial plaintext HTTP request to `http://bank.com`.
2. **Proxying** — The attacker forwards a secure HTTPS request to the real server, `https://bank.com`.
3. **Stripping** — The server responds over HTTPS. The attacker receives this secure response, strips the HTTPS formatting, rewrites every `https://` link in the returned HTML to `http://`, and forwards plaintext HTTP back to the victim.

```text
Victim                Attacker (MitM)               Server
------                ---------------               ------
HTTP GET bank.com  -->
                       HTTPS GET bank.com   ------>
                       <------------------- HTTPS Response (HTML)
<-- HTTP Response (HTML w/ stripped links)
```

The victim sees the site render normally, but their browser is talking to the attacker entirely in plaintext, with the attacker acting as a translating proxy. Passwords, session cookies, and form submissions are captured instantly — no certificate warning ever appears, because no TLS handshake with the victim's browser was ever attempted.

## HTTP Strict Transport Security (HSTS)

To defeat SSL stripping, the browser needs a way to *know in advance* that a domain must only ever be reached over HTTPS, eliminating the vulnerable plaintext HTTP request entirely. This is what the `Strict-Transport-Security` response header does.

**HSTS header syntax:**

```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

When a browser receives this header over a valid, authenticated HTTPS connection, it caches the directive for the duration of `max-age` (here, one year in seconds).

### How HSTS Neutralizes the Attack

Once HSTS is active for a domain, if the user types `bank.com` again, the browser rewrites the request to HTTPS *internally*, before a single packet leaves the machine:

```text
Victim Browser (Internal)
-------------------------
User types: bank.com
Browser checks HSTS cache -> Match found!
Browser rewrites scheme to https:// before any network I/O.
```

If an attacker then attempts to intercept the resulting HTTPS connection with a forged or self-signed certificate, the browser shows a hard, non-bypassable warning. Ordinary certificate warnings can often be clicked through by users; HSTS explicitly removes the "continue anyway" option for HSTS-pinned hosts.

### Implementing HSTS (Express.js)

```javascript
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});
```

### Implementing HSTS (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name bank.com;

    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;
}
```

The `always` flag matters: it ensures the header is sent even on error responses (4xx/5xx), where Nginx would otherwise omit `add_header` by default.

## The Bootstrap Problem and HSTS Preloading

HSTS has a **Trust On First Use (TOFU)** gap: the very first time a user visits a site, their browser has not yet received the HSTS header, leaving that single request exposed to SSL stripping.

**HSTS Preloading closes this window entirely.** Domain owners submit their domain to the HSTS Preload List, a dataset maintained by Google and hardcoded directly into the source of Chrome, Firefox, Safari, and Edge. Once a domain is on the list and shipped in a browser release, that browser enforces HTTPS-only behavior for the domain from the very first connection — no network round trip to learn the policy is needed at all.

```text
Requirements to qualify for preloading (hstspreload.org):
  1. Serve a valid HTTPS certificate.
  2. Redirect all HTTP traffic to HTTPS on the same host.
  3. Serve HSTS on the base domain with:
       max-age >= 31536000 (1 year)
       includeSubDomains
       preload
  4. All subdomains must also serve valid HTTPS.
```

## Key Takeaways

- SSL stripping never breaks TLS cryptography — it exploits the plaintext HTTP request that precedes the very first redirect to HTTPS.
- HSTS closes the loophole by making the browser enforce HTTPS from cache, without waiting for a server redirect.
- The TOFU gap in HSTS (the very first visit) is closed globally by preloading the domain directly into browser source trees.
- `includeSubDomains` and a long `max-age` are non-negotiable in production — a short `max-age` or a header scoped to one path re-opens most of the original attack window.

HSTS transforms HTTPS from a reactive, server-issued redirect into a proactive, browser-enforced mandate — and preloading removes even the reactive redirect from the threat model entirely.
