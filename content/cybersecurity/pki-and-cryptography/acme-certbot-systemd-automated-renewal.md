---
title: "Automating TLS Certificate Renewal: Certbot, Systemd Timers, and Deploy Hooks"
description: "A practical guide to eliminating certificate-expiry outages by automating Let's Encrypt renewals with certbot, systemd timers, jittered scheduling, and zero-downtime deploy hooks."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "acme"
  - "lets-encrypt"
  - "certbot"
  - "systemd"
  - "tls-automation"
  - "x509-certificates"
---

# Automating TLS Certificate Renewal: Certbot, Systemd Timers, and Deploy Hooks

## The Problem: The Outage Cost of Manual PKI

For years, TLS certificates were valid for one to three years. Procurement meant generating a private key and CSR, emailing it to a Certificate Authority (CA), paying an invoice, waiting for manual domain validation, and hand-configuring the web server. Because the process was slow and painful, administrators treated renewal as a rare, high-stress event. Inevitably, tracking spreadsheets went stale, the engineer who set it up left the company, and certificates silently expired — causing sudden, highly visible outages at major corporations.

Let's Encrypt broke this cycle by issuing certificates valid for only **90 days**. That aggressive lifetime makes manual renewal impossible at scale by design: if you rely on a human to renew a certificate every 60 days, you will eventually fail. The fix is to treat certificate renewal as unattended infrastructure-as-code, not a calendar reminder.

This guide covers the ACME HTTP-01 challenge mechanics, why `systemd` timers beat `cron` for this job, and the two details that most automated setups get wrong: web server routing for the challenge, and reloading the server after renewal without dropping live connections.

## Recap: How the ACME HTTP-01 Challenge Proves Domain Control

Before automating anything, it helps to know exactly what the automation is doing on your behalf. When an ACME client (like `certbot`) requests a certificate for `api.example.com`, the CA needs cryptographic proof that the requester controls that domain.

```text
    [ACME Server / Let's Encrypt]              [Your Server (Certbot)]
          |                                            |
          | <------ 1. Request cert for domain ------- |
          |                                            |
          | ------- 2. Send challenge token  --------> |
          |                                            |
          |                                   (Creates token file at)
          |                                   (/var/www/html/.well-known/
          |                                    acme-challenge/<TOKEN>)
          |                                            |
    (HTTP GET /.well-known/acme-challenge/<TOKEN>)     |
          | -----------------------------------------> |
          | <--------- 3. Returns token contents ------ |
          |                                            |
    (Validates token matches)                          |
          | ------- 4. Issues signed X.509 cert ------> |
          |                                            |
```

Because Let's Encrypt itself performs the outbound HTTP GET, port 80 must remain reachable from the public internet for this challenge type — even on a server that otherwise redirects every request to HTTPS.

## Why Systemd Timers Beat Cron

Certbot has historically shipped with a `cron` entry like:

```bash
0 0 1 * * /usr/bin/certbot renew --quiet
```

This works, but it's blunt in two ways that matter at scale:

1. **No resilience.** If the server is offline (rebooting, patched, mid-deploy) at exactly midnight on the 1st, the job is simply missed until the next scheduled run.
2. **Thundering herd against the CA.** If millions of servers all run their renewal cron job at exactly `00:00`, the aggregate load looks like a distributed denial-of-service attack against Let's Encrypt's own infrastructure.

Modern Linux distributions solve both problems with `systemd` timers: they support randomized jitter to spread load, automatic retries for missed runs (`Persistent=true`), and structured logging via `journalctl`.

## Implementation: The Certbot Service and Timer

### 1. The Service File

This unit defines *what* to run — a one-shot renewal attempt that only actually renews certificates within 30 days of expiry, followed by a graceful web server reload.

**`/etc/systemd/system/certbot-renewal.service`**
```ini
[Unit]
Description=Certbot Renewal Service
After=network-online.target

[Service]
Type=oneshot
# Only renews if the cert is within 30 days of expiry.
# --post-hook fires only after a successful renewal, reloading Nginx
# so it serves the new certificate without dropping active connections.
ExecStart=/usr/bin/certbot renew --quiet --agree-tos --post-hook "systemctl reload nginx"
```

### 2. The Timer File

This unit defines *when* to run it. Let's Encrypt recommends checking twice daily: if the CA is briefly unreachable or the network blips, the timer simply retries 12 hours later, long before the 30-day renewal window closes.

**`/etc/systemd/system/certbot-renewal.timer`**
```ini
[Unit]
Description=Run Certbot twice daily

[Timer]
# Run at 00:00 and 12:00
OnCalendar=*-*-* 00,12:00:00
# Randomized delay up to 12 hours spreads load across the CA's fleet
RandomizedDelaySec=12h
# If the machine was offline when the timer should have fired,
# run it as soon as it's back online instead of silently skipping it
Persistent=true

[Install]
WantedBy=timers.target
```

### 3. Enabling and Verifying

```bash
sudo systemctl daemon-reload
sudo systemctl enable --now certbot-renewal.timer
```

Confirm the schedule is active:

```bash
$ systemctl list-timers | grep certbot
NEXT                        LEFT          LAST                        PASSED       UNIT                  ACTIVATES
Mon 2026-10-12 04:32:15 UTC 8h left       Sun 2026-10-11 15:12:01 UTC 5h ago       certbot-renewal.timer certbot-renewal.service
```

## Web Server Configuration for HTTP-01

For the challenge to succeed, Nginx must serve `.well-known/acme-challenge/` over plain HTTP on port 80, even when every other request is redirected to HTTPS:

```nginx
server {
    listen 80;
    server_name api.example.com;

    # Explicitly allow ACME challenges over HTTP — do not redirect this path
    location ^~ /.well-known/acme-challenge/ {
        default_type "text/plain";
        root /var/www/html;
    }

    # Redirect everything else to HTTPS
    location / {
        return 301 https://$host$request_uri;
    }
}
```

A common outage-causing mistake is redirecting *all* HTTP traffic (including this path) to HTTPS. That breaks the challenge, because Let's Encrypt's validator makes a plain HTTP request and never follows a redirect back to itself for validation.

## The Crucial Step: Deploy Hooks

Certbot successfully downloads a fresh `fullchain.pem` and `privkey.pem` into `/etc/letsencrypt/live/` — but Nginx (and most web servers) only load certificates into memory at startup. Without an explicit reload, the server keeps serving the *old*, soon-to-expire certificate until it's manually restarted.

Certbot solves this with **deploy hooks**: scripts that run *only* when a certificate is actually renewed (not on every check). Create an executable script under `/etc/letsencrypt/renewal-hooks/deploy/`:

```bash
#!/bin/bash
# /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# Reload Nginx gracefully — active connections finish on the old
# worker processes while new connections get the renewed certificate.
systemctl reload nginx
```

```bash
chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

`systemctl reload` (not `restart`) is what makes this zero-downtime: Nginx spawns new worker processes with the updated certificate while letting existing workers finish serving their current connections before exiting.

Alternatively, the hook can be pinned directly to a single certificate's renewal config at `/etc/letsencrypt/renewal/api.example.com.conf`:

```ini
renew_hook = systemctl reload nginx
```

## Verification Without Burning Rate Limits

Let's Encrypt enforces strict rate limits per domain per week. To validate your entire automated chain — challenge routing, renewal logic, and the deploy hook — without risking a real renewal or hitting those limits, use the staging dry-run flag:

```bash
certbot renew --dry-run
```

This exercises the full HTTP-01 flow against Let's Encrypt's staging environment and fires your deploy hooks exactly as a real renewal would, proving the chain works before you actually need it to.

## Summary

Automating PKI with ACME transforms certificate management from a brittle, human-dependent process into a robust infrastructure primitive. The pieces that make it reliable in practice are: `systemd` timers with jitter and persistence (not blind cron), correct HTTP-01 routing that survives an HTTPS-redirect policy, and a deploy hook that reloads — never restarts — the web server. Together, these eliminate expiration-induced outages as a category of incident entirely.
