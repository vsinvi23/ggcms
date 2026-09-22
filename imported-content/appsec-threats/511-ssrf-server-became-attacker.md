# SSRF Explained: The Server That Became the Attacker

Server-Side Request Forgery (SSRF) represents a catastrophic breakdown in trust boundaries. It occurs when a web application fetches a remote resource without validating the user-supplied URL. In doing so, the server is coerced into acting as a proxy—becoming an attacker that can bypass network perimeters, scan internal resources, and plunder cloud metadata endpoints.

---

## The Problem: The Trusted Fetcher Paradox

Modern applications frequently offer features that require them to import external data: importing profile pictures, fetching web previews, parsing webhooks, or pulling RSS feeds. 

From an architectural standpoint, these servers sit in a privileged position. They typically have access to an internal network segment (VPC) that is isolated from the public internet. Because the network administrator trusts the application server, firewall rules are relaxed inbound from the server to internal microservices, databases, and configuration portals.

When an application blindly trusts user input to make outbound HTTP requests, it bridges the external internet and the internal VPC.

```
+--------------+                 +--------------------+                 +--------------------+
|   Attacker   | --(Payload)-->  | Application Server | --(Request)-->  | Cloud Metadata/    |
| (Untrusted)  |                 | (VPC-Trusted Node) |                 | Internal DB        |
+--------------+                 +--------------------+                 +--------------------+
       |                                   |                                      |
       |  Request:                         |  SSRF Request:                       |
       |  url=http://169.254.169.254/...   |  GET /latest/meta-data/...           |
       +==================================>|=====================================>|
                                           |                                      |
                                           |  Returns IAM credentials             |
                                           |<=====================================+
       |  Steals AWS/GCP Session Keys      |
       |<==================================+
```

By exploiting SSRF, an attacker forces the application server to perform actions on their behalf, such as:
1. **Cloud Metadata Exfiltration:** Accessing cloud provider metadata endpoints (such as `169.254.169.254`) to steal temporary IAM security credentials, project IDs, or SSH keys.
2. **Internal Port Scanning:** Mapping out internal services (e.g., redis running on `127.0.0.1:6379`, databases, or legacy admin panels).
3. **Internal API Abuse:** Interacting with internal HTTP APIs that lack authentication because they assume any traffic originating within the VPC is safe.

---

## Vulnerable Code: The Naive Downloader

Consider this Node.js/Express controller designed to generate website link previews:

```javascript
// VULNERABLE CONTROLLER
const express = require('express');
const axios = require('axios');
const app = express();

app.get('/api/v1/preview', async (req, res) => {
    const { url } = req.query;

    if (!url) {
        return res.status(400).json({ error: "URL parameter is required." });
    }

    try {
        // VULNERABILITY: Blind trust of user input. 
        // No validation of protocol, domain, IP address, or port.
        const response = await axios.get(url, { timeout: 3000 });
        return res.status(200).send(response.data);
    } catch (error) {
        return res.status(500).json({ error: "Failed to fetch preview." });
    }
});
```

### The Exploit Vector

An attacker can exploit this code using several payloads:

1. **Targeting AWS Metadata (IMDSv1):**
   ```http
   GET /api/v1/preview?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/admin-role HTTP/1.1
   Host: target-app.com
   ```
   If the server is running on AWS EC2 or EKS and uses IMDSv1, this request returns temporary AWS credentials with the permissions of the `admin-role`.

2. **Probing Internal Infrastructure:**
   ```http
   GET /api/v1/preview?url=http://127.0.0.1:6379 HTTP/1.1
   Host: target-app.com
   ```
   If Redis is running locally, the response time or returned error message can confirm its presence. Attackers can even execute commands via HTTP-to-gopher or raw TCP pipelining in older HTTP clients.

---

## Defending Against SSRF: The Mitigation Blueprint

Securing an application against SSRF requires a defense-in-depth approach. Simple regex checks or blacklists are notoriously easy to bypass (using decimal IP notation, DNS redirects, or wildcard DNS services like `nip.io`).

A robust defense must perform three distinct validations:
1. **Protocol Whitelisting:** Enforce `http://` or `https://` only. Prevent `file://`, `gopher://`, `ftp://`, or `dict://`.
2. **DNS Resolution and IP Validation:** Resolve the target hostname to an IP address *before* establishing a connection, and verify that the IP does not fall within private, loopback, or multicast ranges (RFC 1918, RFC 1122, RFC 5735).
3. **DNS Rebinding Prevention:** Ensure the validated IP address is the exact IP used for the connection. Attackers can configure a DNS server to return a public IP during validation, but resolve to an internal IP (like `127.0.0.1`) milliseconds later during the actual fetch.

### Robust Go Mitigation Implementation

Below is a production-ready HTTP Client wrapper in Go that safely mitigates SSRF by intercepting DNS resolution and enforcing strict IP checks on the socket level.

```go
package ssrf

import (
	"context"
	"errors"
	"net"
	"net/http"
	"syscall"
	"time"
)

// List of private and loopback CIDRs to block.
var privateIPBlocks []*net.IPNet

func init() {
	for _, cidr := range []string{
		"127.0.0.0/8",    // IPv4 loopback
		"10.0.0.0/8",     // RFC1918
		"172.16.0.0/12",  // RFC1918
		"192.168.0.0/16", // RFC1918
		"169.254.0.0/16", // Link-local (Cloud Metadata)
		"::1/128",        // IPv6 loopback
		"fe80::/10",      // IPv6 link-local
		"fc00::/7",       // IPv6 unique local addr
	} {
		_, block, _ := net.ParseCIDR(cidr)
		privateIPBlocks = append(privateIPBlocks, block)
	}
}

// isSafeIP checks if the IP address is public and safe to connect to.
func isSafeIP(ip net.IP) bool {
	if ip == nil {
		return false
	}
	for _, block := range privateIPBlocks {
		if block.Contains(ip) {
			return false
		}
	}
	return ip.IsGlobalUnicast() && !ip.IsLoopback() && !ip.IsLinkLocalUnicast()
}

// NewSafeHTTPClient returns an http.Client configured to prevent SSRF and DNS Rebinding.
func NewSafeHTTPClient(dialTimeout time.Duration) *http.Client {
	dialer := &net.Dialer{
		Timeout:   dialTimeout,
		KeepAlive: dialTimeout,
	}

	// We intercept the network dialer to inspect the resolved IP address BEFORE connection.
	// This prevents DNS rebinding because we resolve the address and bind directly to the safe IP.
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			// Perform lookup via safe system resolver
			ips, err := net.DefaultResolver.LookupIPAddr(ctx, host)
			if err != nil {
				return nil, err
			}

			if len(ips) == 0 {
				return nil, errors.New("could not resolve hostname")
			}

			// Validate all resolved IPs
			for _, ip := range ips {
				if !isSafeIP(ip.IP) {
					return nil, errors.New("forbidden target IP address: local/private range detected")
				}
			}

			// Pick the first validated IP address to establish the physical connection.
			// This completely bypasses subsequent DNS lookups during the connection handshake.
			targetAddr := net.JoinHostPort(ips[0].IP.String(), port)
			
			// Establish socket-level connection control
			return dialer.DialContext(ctx, network, targetAddr)
		},
		// Prevent connecting via proxy configs in environment variables
		Proxy: nil,
	}

	return &http.Client{
		Transport: transport,
		Timeout:   dialTimeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			// Ensure redirects are also checked against the security policy
			if len(via) >= 10 {
				return errors.New("too many redirects")
			}
			return nil
		},
	}
}
```

---

## Architectural Protections

1. **Deploy Network Segmentation:** Isolate application servers that must fetch external content into a dedicated DMZ VPC with strict outbound firewall rules (Egress filtering). Block all outbound traffic except to necessary external ports.
2. **Enforce IMDSv2:** If deploying to AWS, transition entirely to Instance Metadata Service Version 2. IMDSv2 requires a session-oriented flow where a session token is fetched via a `PUT` request with a `X-aws-ec2-metadata-token-ttl-seconds` header before keys can be requested. This provides high-entropy protection against standard GET-based SSRF.
3. **Dedicated Proxy Architectures:** Rather than allowing the application nodes to request external content directly, routing all outbound requests through a restricted, monitored egress proxy (such as Squid or AWS NAT Gateways) that maintains strict domain allowlists can stop arbitrary SSRF exploits instantly.
