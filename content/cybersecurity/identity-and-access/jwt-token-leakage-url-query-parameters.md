---
title: "Why Passing JWTs in URL Query Parameters Leaks Them"
description: "The four places a JWT placed in a URL query string ends up logged or cached — browser history, Referer headers, access logs, TLS-inspecting proxies — and the secure alternatives."
type: "ARTICLE"
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "jwt"
  - "token-leakage"
  - "url-parameters"
  - "referer-header"
  - "access-logs"
---

# Why Passing JWTs in URL Query Parameters Leaks Them

## The Problem: The Temptation of URL-Based Authentication

The accepted, secure way to transmit a JWT is the `Authorization` header with the `Bearer` scheme:

```http
GET /api/v1/user/profile HTTP/1.1
Host: api.example.com
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR...
```

But some scenarios make setting a header awkward:

- Opening a WebSocket connection where header control is limited by the browser API.
- Triggering a file download via a plain `<a href="...">` link.
- Displaying an authenticated image in an `<img>` tag.
- A cross-domain redirect where the header wouldn't survive the hop.

Under that pressure, developers reach for the query string instead:

```text
https://api.example.com/download/report.pdf?token=eyJhbGciOiJIUzI1NiIsInR...
```

It works. It also leaks the token through several infrastructure layers that never touch the `Authorization` header.

## The Mental Model: The Postcard vs. The Envelope

Treat an HTTP request like physical mail. The body and headers are the letter folded *inside* an envelope — routers and proxies can see the envelope's destination but (under TLS) not its contents. The URL, including its query string, is the address written on the *outside* — a postcard, read by everyone who has to route it, logged by everyone who handles it, regardless of TLS.

Putting a JWT in the query string writes the user's live credential on the outside of that postcard.

## The Vectors of Leakage

### 1. Browser History and Bookmarks

Browsers persist every visited URL verbatim. Physical access to an unlocked device, or malware pulling `History` (Chrome) / `places.sqlite` (Firefox), hands over a fully functional token. Bookmarking or sharing the link with a colleague does the same thing unintentionally.

### 2. The `Referer` Header

If the authenticated page (`https://example.com/dashboard?token=...`) links out to any external site, clicking that link sends the full URL — token included — as the `Referer` header on the outbound request:

```http
GET / HTTP/1.1
Host: external-analytics.com
Referer: https://example.com/dashboard?token=eyJhbGciOiJIUzI1NiIsInR...
```

The third party's server logs now contain a live JWT. `Referrer-Policy: strict-origin-when-cross-origin` reduces cross-domain exposure but does nothing for same-origin navigation or older browser behavior.

### 3. Server-Side Access Logs

Nginx, Apache, load balancers, and APM tools log the full request line by default, query string included:

```text
192.168.1.10 - - [10/Oct/2026:13:55:36 +0000] "GET /api/download?token=eyJhbG... HTTP/1.1" 200 1024
```

Those logs routinely ship to Splunk, Elastic, or Datadog — meaning a JWT ends up as plaintext in monitoring infrastructure, expanding the blast radius of any log-store compromise and creating a compliance problem (SOC2, PCI-DSS) independent of whether the token is ever actually stolen.

### 4. Corporate Proxies and TLS Interception

Enterprise forward proxies that terminate and re-encrypt outbound TLS routinely log every requested URL for audit purposes. A JWT in a query string is captured and retained indefinitely by IT, well outside the application's own control.

```
+--------+          +----------------+         +------------------+        +----------------+
| Browser| --URL--> | Corporate Proxy| --URL-->| Load Balancer/WAF| --URL->|  API Access Logs|
+--------+          +----------------+         +------------------+        +----------------+
     |                     |                            |                          |
     +---------------------+----------------------------+--------------------------+
                   every hop above sees and can persist the token
```

## Secure Architectural Alternatives

Never pass bearer tokens in a URL. When the `Authorization` header genuinely can't be set:

1. **Short-lived, `HttpOnly` session cookies.** For downloads or direct navigation, a scoped cookie is attached automatically by the browser and never appears in a URL or its logs.
2. **Single-use exchange tokens.** For cases that must be URL-based (an email verification link, for instance), generate a cryptographically random, single-use nonce with a short server-side expiry (60 seconds is typical), and put *that* in the URL instead of the real JWT. The client exchanges the nonce via a `POST` for the actual token. If the nonce leaks in a log, it's already useless by the time anyone reads the log.
