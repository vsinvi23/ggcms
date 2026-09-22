# ACME Let's Encrypt: Configuring Certbot Timers for Automated Seamless Renewals

## The Problem: Outages Triggered by Manual Certificate Renewals

Historically, managing SSL/TLS certificates was a manual process: buying files from a CA, verifying domains, and pasting keys into servers. With the introduction of Let's Encrypt and the **ACME (Automated Certificate Management Environment)** protocol, automated certificate issuance became standard practice.

However, Let's Encrypt certificates are valid for exactly **90 days**. This short lifetime is a deliberate security feature (limiting exposure of compromised keys), but it introduces operational risks:

1. **Silent Failures:** If domain challenges fail due to temporary network issues, DNS routing anomalies, or ACME API changes, the certificate will expire silently, taking your services offline.
2. **Brittle Cron Jobs:** Basic cron configurations (`0 0 1 * * certbot renew`) lack random delays, meaning thousands of servers query ACME servers simultaneously, triggering rate limits. Furthermore, standard cron fails to handle system startup delays or log rotation natively.

To achieve seamless enterprise renewals, operations teams must configure systemd timers with pre-hooks, post-hooks, and verification pipelines.

---

## Architectural Blueprint: The Safe Renewal Lifecycle

```
       +----------------------------+
       |   Systemd Timer Trigger    |  (Twice Daily, randomized delay)
       +----------------------------+
                     |
                     v
       +----------------------------+
       | Certbot Checks Expiry Date |  (Runs: certbot renew --dry-run)
       +----------------------------+
                     |
         +-----------+-----------+
         | (< 30 days left)      | (>= 30 days left)
         v                       v
+------------------+     +---------------+
| Run Pre-Hook     |     |   Exit (0)    |
| (Check port 80)  |     |   (No Action) |
+------------------+     +---------------+
         |
         v
+------------------+
| ACME Challenge   | (DNS-01 or HTTP-01)
+------------------+
         |
         v
+------------------+
| Run Deploy-Hook  | (Nginx reload / HAProxy restart)
+------------------+
```

---

## Configuration Blueprint: Systemd Units and Hooks

To replace brittle cron configurations, configure a robust systemd service paired with a randomized systemd timer.

### 1. The Systemd Service: `/etc/systemd/system/certbot-renewal.service`

```ini
[Unit]
Description=Certbot Automated Certificate Renewal
Documentation=https://certbot.eff.org/docs/
After=network.target network-online.target

[Service]
Type=oneshot
ExecStart=/usr/bin/certbot -q renew --non-interactive --post-hook "systemctl reload nginx"
PrivateTmp=true
ProtectSystem=full
```

### 2. The Systemd Timer: `/etc/systemd/system/certbot-renewal.timer`

```ini
[Unit]
Description=Run certbot renewal twice daily

[Timer]
OnCalendar=*-*-* 04,16:15:00
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
```

---

## Complete Shell and Hook Script Pipeline

The following script automates the installation and configuration of the renewal pipeline. It sets up pre-renew and deploy-renew hooks, and registers a systemd automated validation test check.

```bash
#!/usr/bin/env bash
# secure-renewal-setup.sh
# Configures Certbot hooks and systemd timers for Zero-Downtime renewals

set -euo pipefail

HOOKS_DIR="/etc/letsencrypt/renewal-hooks"
PRE_HOOK_FILE="${HOOKS_DIR}/pre/01-verify-ports.sh"
DEPLOY_HOOK_FILE="${HOOKS_DIR}/deploy/01-reload-services.sh"

echo "[*] Creating Let's Encrypt renewal hook directories..."
mkdir -p "${HOOKS_DIR}/pre"
mkdir -p "${HOOKS_DIR}/post"
mkdir -p "${HOOKS_DIR}/deploy"

# 1. Pre-hook: Validate that the port 80 is clear or correctly routed
echo "[*] Writing Pre-Hook validation script..."
cat << 'EOF' > "$PRE_HOOK_FILE"
#!/usr/bin/env bash
echo "[+] Certbot pre-hook: Verifying port 80 availability..."
if ! nc -z localhost 80; then
    echo "[!] Warning: Port 80 is closed. Ensure firewall rules allow HTTP-01 challenges."
fi
EOF
chmod +x "$PRE_HOOK_FILE"

# 2. Deploy-hook: Reload (not restart) Nginx to apply certificates without dropping connections
echo "[*] Writing Deploy-Hook reload script..."
cat << 'EOF' > "$DEPLOY_HOOK_FILE"
#!/usr/bin/env bash
echo "[+] Certbot deploy-hook: Active certificate renewal detected."
if systemctl is-active --quiet nginx; then
    echo "[+] Gracefully reloading Nginx to apply new certificates..."
    systemctl reload nginx
fi
if systemctl is-active --quiet haproxy; then
    echo "[+] Gracefully reloading HAProxy..."
    systemctl reload haproxy
fi
EOF
chmod +x "$DEPLOY_HOOK_FILE"

# 3. Systemd Timer Registration
echo "[*] Registering systemd timer service..."
systemctl daemon-reload
systemctl enable --now certbot-renewal.timer

# 4. Immediate Dry-Run Validation
echo "[*] Executing dry-run validation..."
certbot renew --dry-run --non-interactive

echo "[+] Seamless automated renewal configuration is active and verified."
```

By separating the **deploy-hook** (which only triggers when a certificate is successfully renewed) from the **post-hook**, you avoid reload commands during dry-runs or unsuccessful attempts, establishing a zero-downtime, zero-touch certificate lifecycle.
