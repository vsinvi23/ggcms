---
title: "Zero Trust Network Access (ZTNA) vs Legacy VPNs"
description: "Why the castle-and-moat VPN model fails against lateral movement and stolen credentials, how ZTNA's identity-aware proxy model replaces it, and a Go middleware example enforcing continuous per-request trust evaluation."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "ztna"
  - "zero-trust"
  - "vpn"
  - "identity-aware-proxy"
  - "micro-segmentation"
  - "caep"
  - "lateral-movement"
---

# Zero Trust Network Access (ZTNA) vs Legacy VPNs

## The Problem: The Myth of the Trusted Network

For decades, enterprise security relied on the "castle-and-moat" paradigm. Network security teams deployed virtual private networks (VPNs) to establish a secure perimeter. Once a user successfully authenticated at the VPN gateway, they were granted access to the internal network — the "castle."

In modern distributed ecosystems — where applications reside in multiple public clouds, APIs are consumed by third parties, and employees work remotely — this model is fundamentally broken. A legacy VPN makes a fatal assumption: that anyone inside the network is trustworthy. If an attacker compromises a single VPN credential, they gain broad lateral access to the entire corporate network, allowing them to scan, exploit, and exfiltrate sensitive data across internal servers that have nothing to do with the application the credential was meant for.

## Mental Model: Implicit Trust vs. Continuous Verification

Legacy VPNs grant access to a *network segment*, relying on IP-level trust. ZTNA grants access to a specific *application*, relying on cryptographically verified identity, device health, and environmental context — re-evaluated continuously, not just once at connection time.

```text
Legacy VPN Model (Castle-and-Moat):
[User] ---> [VPN Gateway] ===(Authenticated)===> [Whole Internal Network] (Lateral Access!)

ZTNA Model (Identity-Aware Proxy):
[User] ---> [Context Check: ID + Device Health] ---> [Micro-Segmented Broker] ---> [App A Only]
                                                                             X-> [App B Blocked]
```

## Architectural Differences: Network vs. Application Centric

| Feature | Legacy VPN | Zero Trust Network Access (ZTNA) |
| :--- | :--- | :--- |
| **Access Model** | Network-centric (OSI Layer 3/4) | Application-centric (OSI Layer 7) |
| **Trust Model** | Implicit trust after connection | Continuous, adaptive validation |
| **Perimeter Visibility** | Open ports discoverable via port scans | Dark cloud architecture (SDP); resources are invisible |
| **Lateral Movement** | High risk; subnet scanning allowed | Minimized; direct application broker channels only |

Core tenets of ZTNA, restated as engineering requirements:

1. **Verify Explicitly** — authentication and authorization are mandatory before *every* transaction, considering identity, device health, location, and behavioral anomalies, not just at initial login.
2. **Least Privilege Access** — users only see and access the exact applications they are authorized to use. The rest of the network is invisible ("dark").
3. **Assume Breach** — micro-segmentation and continuous monitoring operate under the assumption that some part of the environment is already compromised, so no single access grant should expose everything.

## Critical Attack Vectors: Why VPNs Fail

### 1. Lateral Movement and Internal Scanning

Once authenticated to a legacy VPN, a user's device is assigned an IP address on the internal subnet.

* **The Attack:** An attacker compromises an engineer's laptop. Using the VPN client, the attacker runs `nmap` across the `/16` corporate subnet, identifies unpatched internal databases, and executes exploits laterally.
* **The ZTNA Defense:** ZTNA operates as an Identity-Aware Proxy (IAP) or Software-Defined Perimeter (SDP). The client connects to an intermediary broker, which forwards traffic *only* to the specific application authorized for that user session. The underlying network remains completely invisible; network scanning returns nothing because there is no routable internal network to discover.

### 2. Credential Theft and Session Hijacking

VPNs typically rely on static credentials combined with one-time MFA checks at connection time.

* **The Attack:** An attacker steals a session cookie or uses MFA fatigue to log into the VPN gateway. They maintain an active connection for hours or days without re-authentication.
* **The ZTNA Defense:** ZTNA continuously evaluates trust throughout the session. If the user's location suddenly shifts, device compliance fails (e.g., firewall is disabled), or anomalous behavior is detected, the broker revokes access instantly — mid-session, not just at the next login.

```text
       Client Application                 ZTNA Broker                 Auth & MDM Engine
               |                               |                              |
               |-- 1. Request App Access ----->|                              |
               |                               |-- 2. Query Context --------->|
               |                               |      (ID, IP, MDM Health)    |
               |                               |<-- 3. Return Trust Score ----|
               |                               |                              |
               |<-- 4. Tunnel Established -----|                              |
               |    (App A Only)               |                              |
               |                               |                              |
               |-- 5. MDM reports AV disabled ------------------------------->|
               |                               |-- 6. Trigger Revocation ---->|
               |X-- 7. Tunnel Terminated ------|                              |
```

## Building a ZTNA Policy Framework

To implement a secure ZTNA policy, engineers must define multi-dimensional criteria before establishing an application tunnel:

1. **Identity Verification:** Leverage OpenID Connect (OIDC) or SAML federated with an Identity Provider (IdP) enforcing strong phishing-resistant FIDO2/WebAuthn MFA.
2. **Device Posture Assessment:** Integrate with Mobile Device Management (MDM) or Unified Endpoint Management (UEM) agents to verify that the OS is fully patched, antivirus is active, and disk encryption is enabled.
3. **Context-Aware Metrics:** Evaluate the request's geographical origin, IP intelligence (checking for VPN/Tor exit nodes), and time-of-day policies to compute a dynamic risk score.

## Implementation: Identity-Aware Proxy Middleware (Go)

A common implementation of ZTNA for web applications is the Identity-Aware Proxy. The application itself is removed from the public internet (and often the internal routing table for regular users). Instead, an Envoy/proxy sits in front of the application, cryptographically verifying identity tokens injected by the ZTNA control plane on every single request — not once per session.

```go
package main

import (
	"context"
	"fmt"
	"net/http"
	"time"
	"github.com/golang-jwt/jwt/v5"
)

// The ZTNA Proxy validates the signed contextual identity token on EVERY request.
func ZTNAProxyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Extract the assertion token injected by the ZTNA Gateway (e.g., via mTLS or header)
		tokenString := r.Header.Get("X-ZTNA-Assertion")
		if tokenString == "" {
			http.Error(w, "Missing ZTNA Assertion", http.StatusUnauthorized)
			return
		}

		// 2. Cryptographically verify the token (simulated local validation for speed)
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodRSA); !ok {
				return nil, fmt.Errorf("unexpected signing method")
			}
			return getZTNAPublicKey(), nil // Fetch cached IdP public key
		})

		if err != nil || !token.Valid {
			http.Error(w, "Invalid ZTNA Assertion", http.StatusForbidden)
			return
		}

		claims := token.Claims.(jwt.MapClaims)

		// 3. Continuous Context Verification (Device Posture & Risk)
		deviceCompliance, _ := claims["device_compliant"].(bool)
		riskScore, _ := claims["risk_score"].(float64)

		if !deviceCompliance || riskScore > 75.0 {
			// Device has fallen out of compliance during the session (e.g., firewall disabled)
			http.Error(w, "Device out of compliance or risk too high", http.StatusForbidden)
			return
		}

		// 4. Inject validated identity context downstream to the actual application
		ctx := context.WithValue(r.Context(), "user_id", claims["sub"])
		ctx = context.WithValue(ctx, "roles", claims["roles"])

		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// ... Main server initialization handling proxy routing ...
```

The middleware re-evaluates `device_compliant` and `risk_score` on every incoming request, not just at the initial handshake — this is what turns "authenticated once" into "continuously verified," the property a legacy VPN's static tunnel cannot offer.

## Engineering Considerations

1. **Inbound Port Elimination:** True ZTNA architectures utilize outbound-only connections from the application servers to the ZTNA gateway (e.g., Cloudflare Tunnels, Tailscale). This closes all inbound firewall ports, effectively cloaking the application from port scanners and DDoS attacks.
2. **Continuous Evaluation (CAEP):** ZTNA is not just authentication at login. Integrating the Continuous Access Evaluation Profile (CAEP) allows the IdP to push asynchronous risk events (e.g., "impossible travel detected") to the proxy, instantly terminating active application tunnels without waiting for a token to expire naturally.
3. **Legacy Protocols:** While HTTP is straightforward via IAP, securing legacy protocols (RDP, SSH, SMB) requires lightweight endpoint agents that facilitate local port forwarding through the ZTNA encrypted overlay network.

## Key Takeaways

- Legacy VPNs grant network-level trust once at connection time; ZTNA grants application-level trust, re-evaluated continuously, per request.
- The lateral-movement attack that defines VPN failure — `nmap` across a `/16` after a single compromised credential — is structurally impossible under ZTNA because the internal network is never routable to the client at all.
- CAEP-style continuous evaluation is what lets a ZTNA broker revoke access mid-session when device posture changes, something a VPN's static tunnel has no mechanism to do.
- Outbound-only connections from application servers to the ZTNA gateway eliminate inbound ports entirely, removing an entire class of port-scanning and direct-exploitation attacks that VPN-exposed subnets are vulnerable to.
