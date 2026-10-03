---
title: "X.509 Subject Alternative Names: Multi-Domain and Wildcard Certificates"
description: "Why browsers stopped trusting the Common Name field, how the SAN extension lets one certificate cover multiple domains, and how wildcard matching rules actually work at each subdomain level."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "x509-certificates"
  - "subject-alternative-name"
  - "wildcard-certificates"
  - "csr"
  - "openssl"
---

# X.509 Subject Alternative Names: Multi-Domain and Wildcard Certificates

## The Problem: The Rigid Common Name

In the early web, securing a site with SSL/TLS was rigid by design. When a Certificate Authority issued an X.509 certificate, it embedded the exact requested domain (`www.example.com`) in a field called the **Common Name (CN)**, part of the certificate's Subject. A browser connecting to a server compared the URL it was requesting against that single CN string, character for character. Match, and the connection was trusted.

That model breaks down the moment infrastructure gets even slightly more complex than "one server, one domain." A single load balancer or reverse proxy today routinely fronts multiple distinct domains (`example.com`, `example.org`, `example.net`) and dozens of microservice subdomains (`api.example.com`, `mail.example.com`, `admin.example.com`). Issuing, tracking, installing, and renewing a separate certificate for every single hostname variant is both an operational nightmare and, historically, expensive.

## The Solution: Subject Alternative Names (SAN)

RFC 2818 formalized the fix: the **Subject Alternative Name (SAN)** extension, embedded directly in the certificate's ASN.1 structure. Instead of one identity string, SAN holds an *array* of identities — all cryptographically bound to the same public key and signed by the same CA. Every modern browser now **ignores the Common Name entirely** and validates identity exclusively against the SAN extension; a certificate with a perfectly matching CN but no SAN entry for the requested hostname will be rejected.

## Mental Model: The VIP Guest List

The old Common Name model is a personalized badge with one name printed on it — if John Smith brings his spouse, she needs her own separate badge. The SAN extension is a master guest list printed on the back of a single badge: the security guard checks the badge's signature once, flips it over, and confirms that `John Smith`, `Jane Smith`, and `Smith Family LLC` are all authorized to enter on that one badge.

## SAN Entry Types

The SAN extension supports several identity types in a single certificate, not just DNS names:

```text
X509v3 Subject Alternative Name:
    DNS:example.com, DNS:www.example.com, DNS:example.org, IP Address:192.168.1.100
```

This multi-domain capability (often marketed historically as a "UCC" or multi-domain certificate) is what makes a single certificate practical for an edge load balancer, reverse proxy, or Kubernetes ingress controller fronting an entire portfolio of unrelated domains.

## Wildcard Certificates: What They Actually Cover

For infrastructure that spins up subdomains dynamically — `dev-4471.example.com` for a CI/CD ephemeral environment, `tenant-882.example.com` for a multi-tenant SaaS deployment — explicitly enumerating every subdomain in the SAN list is impossible. The **wildcard** entry solves this with an asterisk that matches exactly one subdomain label:

- `*.example.com` matches `api.example.com`, `mail.example.com`, `dev.example.com` — any single label directly under `example.com`.
- **It does not match the apex domain** `example.com` itself.
- **It does not match a deeper level**, like `v1.api.example.com` — the wildcard covers exactly one subdomain depth, never a chain of them.

```text
             *.example.com  matches:                 does NOT match:

             api.example.com                          example.com
             mail.example.com                         v1.api.example.com
             dev.example.com                           (root apex domain, and
             (any single label)                         any second-level subdomain)
```

To cover both the root domain and its direct subdomains, a certificate's SAN array must list both explicitly:

```text
X509v3 Subject Alternative Name:
    DNS:example.com, DNS:*.example.com
```

## Generating a CSR With SAN Entries

Modern OpenSSL requires an explicit configuration file to inject the SAN extension into a Certificate Signing Request — the legacy `-subj` command-line flag alone only sets the (now largely ignored) Common Name.

**`openssl.cnf`:**
```ini
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
req_extensions     = req_ext
distinguished_name = dn

[ dn ]
C  = US
O  = Example Security Corp
CN = example.com

[ req_ext ]
# Tells OpenSSL to pull SAN entries from the alt_names section below
subjectAltName = @alt_names

[ alt_names ]
DNS.1 = example.com
DNS.2 = *.example.com
DNS.3 = internal.api.example.com
IP.1  = 10.0.0.5
```

Generate the private key and CSR together, with the SAN extension embedded:

```bash
openssl req -new -sha256 -nodes -out example.csr -newkey rsa:2048 \
  -keyout example.key -config openssl.cnf
```

Once a CA signs this CSR, the resulting certificate cryptographically binds the RSA public key to every domain, wildcard, and IP address listed in the `alt_names` block — and a browser will validate a connection to any of them against this single certificate.

## Verifying a Certificate's SAN Entries

After issuance, confirm the SAN extension actually contains what was requested rather than assuming the CA processed the CSR correctly:

```bash
openssl x509 -in example.crt -noout -text | grep -A1 "Subject Alternative Name"
```

## Key Takeaways

- Browsers validate hostname identity exclusively against the SAN extension today; the Common Name field is effectively vestigial and ignored by modern TLS clients.
- A single certificate can legitimately cover unrelated domains, subdomains, and IP addresses via multiple SAN entries, which is what makes centralized load balancers and ingress controllers practical.
- A wildcard (`*.example.com`) matches exactly one subdomain label — never the apex domain, and never a deeper nested subdomain — so covering both the root and its subdomains requires two explicit SAN entries.
- Generating a CSR with SAN entries requires an OpenSSL config file with an explicit `[alt_names]` section; the legacy `-subj` CLI flag alone does not populate SAN.
