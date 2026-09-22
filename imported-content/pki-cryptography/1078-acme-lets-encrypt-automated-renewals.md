# ACME Let's Encrypt: Configuring Certbot Timers for Automated Seamless Renewals

## The Problem: The 90-Day Outage Cliff

Let's Encrypt revolutionized web security by offering free SSL/TLS certificates. However, to encourage automation and limit the damage of compromised private keys, Let's Encrypt certificates are issued with a short lifetime: **90 days**.

Relying on manual renewal processes for certificates introduces an unacceptable risk of human error. If an administrator forgets a renewal date, or if a post-renewal service reload step fails, public-facing APIs, web servers, and client applications suffer sudden, catastrophic trust outages:

```
[ Expired TLS Certificate State ]
User Web Browser ---> HTTPS Handshake ---> Web Server (Expired Cert)
                             |
                             v
                  [ NET::ERR_CERT_DATE_INVALID ]
                    (Uptime & Revenue Dropped!)
```

To eliminate this vulnerability, security engineering teams must implement zero-touch automation using the **ACME (Automated Certificate Management Environment)** protocol, managed by robust system-level orchestrators like **Systemd Timers**.

---

## Architectural Flow: Zero-Touch ACME Renewal Pipeline

The ACME protocol orchestrates validation, issuance, and deployment securely without exposing server access to the CA.

```
+----------+             (1) Request Challenge            +-------------+
|          | <==========================================> |             |
|          |                                              |             |
|          |             (2) Solve Challenge              |             |
|          | -------------------------------------------> | Let's       |
|          |     [HTTP-01: Serve token on Port 80]        | Encrypt     |
| Certbot  |     [DNS-01 : Add TXT Record to DNS]         | ACME        |
| Client   |                                              | Server      |
|          | <------------------------------------------- |             |
|          |            (3) Validate & Issue              |             |
|          |                                              |             |
+----------+                                              +-------------+
     |
     v (Triggered twice daily by Systemd Timer)
+-----------------------------------------------------------------------+
|                         SYSTEMD POST-RENEWAL FLOW                     |
|                                                                       |
|  [ Certbot Renew ] --> Check: "Is cert expiration < 30 days?"          |
|                                                                       |
|         +---> No  --> Exit 0 (No action)                              |
|         +---> Yes --> Request ACME Issuance                           |
|                         |                                             |
|                         v                                             |
|                       [ Success ]                                     |
|                         |                                             |
|                         v                                             |
|                       [ Deploy Hook ] --> `systemctl reload nginx`    |
+-----------------------------------------------------------------------+
```

---

## Technical Validation: HTTP-01 vs. DNS-01 Challenges

When automated renewals are configured, selection of the ACME validation challenge determines the system's network topology:

1. **HTTP-01 Challenge**:
   * **Mechanism**: Certbot places a token file at `.well-known/acme-challenge/<TOKEN>` on your web server. Let's Encrypt verifies domain ownership by making a public HTTP request to port 80.
   * **Limitations**: Requires port 80 to be open to the internet. Cannot issue wildcard certificates (`*.yourdomain.com`).
2. **DNS-01 Challenge**:
   * **Mechanism**: Certbot uses a provider-specific plugin to add a temporary cryptographic `TXT` record matching `_acme-challenge.yourdomain.com` directly to your DNS zone.
   * **Advantages**: Does not require open ingress ports on your local network. Safely issues wildcard certificates. Perfect for securing internal, private-network servers.

---

## Production Implementation: Systemd Automation Suite

To run renewals silently and robustly in production, bypass raw cron jobs (which lack state tracking, centralized logging, and random jitter) and instantiate a dedicated **Systemd Service** and **Systemd Timer**.

### 1. The Systemd Service File
Save this configuration to `/etc/systemd/system/certbot-renewal.service`. It defines the execution environment and invokes certbot.

```ini
[Unit]
Description=Certbot Automated Let's Encrypt Renewal Service
After=network.target network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot renew --quiet --agree-tos --deploy-hook "/usr/local/bin/certbot-deploy-hook.sh"
SuccessExitStatus=0
```

### 2. The Systemd Timer File
Save this configuration to `/etc/systemd/system/certbot-renewal.timer`. This acts as the trigger, running twice daily to check expiration boundaries and introducing random delay (jitter) to prevent hammering the ACME servers.

```ini
[Unit]
Description=Run Certbot Renewal Twice Daily to Prevent Outages

[Timer]
OnCalendar=*-*-* 04:30:00
OnCalendar=*-*-* 16:30:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

### 3. The Deploy Hook Shell Script
Save this script to `/usr/local/bin/certbot-deploy-hook.sh` and make it executable (`chmod +x`). Certbot executes this **only** when a certificate is successfully renewed, preventing redundant service disruptions.

```bash
#!/usr/bin/env bash
# /usr/local/bin/certbot-deploy-hook.sh
set -euo pipefail

echo "ACME Renewal detected. Executing secure deploy hooks..."

# Identify which certificate renewed using Certbot environment variables
RENEWED_DOMAINS="${RENEWED_DOMAINS:-}"
echo "Renewed domains: ${RENEWED_DOMAINS}"

# Check and reload Web Server / API Proxy
if systemctl is-active --quiet nginx; then
    echo "Reloading NGINX configuration..."
    systemctl reload nginx
elif systemctl is-active --quiet haproxy; then
    echo "Reloading HAProxy service..."
    systemctl reload haproxy
else
    echo "No matching active gateway detected. Manual intervention required to reload TLS server."
    exit 1
fi

echo "Certbot deployment hook completed successfully."
```

---

## Activating the Automation Suite

To activate the timer, run the following command sequence via shell:

```bash
# Set secure execution permissions for the deploy hook
chmod 700 /usr/local/bin/certbot-deploy-hook.sh

# Reload Systemd manager configuration
systemctl daemon-reload

# Enable and start the timer immediately
systemctl enable --now certbot-renewal.timer

# Verify the timer status and check next execution time
systemctl list-timers --all | grep certbot
```
