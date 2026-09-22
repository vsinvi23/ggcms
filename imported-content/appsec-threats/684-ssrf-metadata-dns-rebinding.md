# Server-Side Request Forgery (SSRF): Preventing DNS Rebinding and Metadata Attacks

## The Problem: Trusting Outbound Network Channels
Server-Side Request Forgery (SSRF) occurs when an application receives a user-supplied URL and attempts to fetch this remote resource (e.g., fetching an avatar, scanning a PDF, or parsing an external RSS feed) without verifying the network destination. If the application does not validate the target address, an attacker can input URLs pointing to internal-only systems (such as `http://localhost:8080/admin`, internal databases, Kubernetes control planes, or cloud metadata endpoints like `http://169.254.169.254`). 

Even if developers implement simple IP blacklists (e.g., blocking `127.0.0.1` and `169.254.0.0/16`), attackers can bypass these filters entirely using a technique known as **DNS Rebinding**, which exploits the Time-of-Check to Time-of-Use (TOCTOU) pattern of DNS resolution.

---

## Architectural View: The DNS Rebinding Exploit Loop
DNS Rebinding operates by configuring a malicious nameserver to dynamically alternate its resolution answers with a Time-To-Live (TTL) of zero.

```
       [ Vulnerable App Server ]                      [ Attacker DNS Nameserver ]
                   |                                               |
                   | -- 1. Query: "malicious.attacker.com" ------->|
                   |                                               |
                   |<-- 2. Answer (TTL=0): IP is 8.8.8.8 (SAFE) ---|
                   |
[ TOCTOU CHECK ]   |  (Server validates IP 8.8.8.8 -> "IP is allowed!")
                   |
                   | -- 3. Fetch Data from "malicious.attacker.com" ->|
                   |    (TTL expired! Server must resolve DNS again) |
                   |                                               |
                   | -- 4. Query: "malicious.attacker.com" ------->|
                   |                                               |
                   |<-- 5. Answer: IP is 169.254.169.254 (INTERNAL)|
                   |
[ TOCTOU USE ]     | -- 6. HTTP GET to 169.254.169.254 (IMDS) ---->|
                   v
      [ Sensitive Cloud Metadata Exfiltrated! ]
```

---

## Technical Deep Dive: The Secure Outbound Fetcher
To prevent SSRF and DNS Rebinding, you must enforce a **Secure Outbound HTTP Client** architecture. The client must:
1. Resolve the target hostname to an IP address.
2. Verify that the resolved IP does **not** belong to loopback (`127.0.0.0/8`), private (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`), link-local (`169.254.0.0/16`), or multicast CIDR ranges.
3. Establish the TCP connection **directly to the pre-validated IP address**, bypassing any subsequent DNS lookup to eliminate the TOCTOU rebinding vulnerability.

Below is a complete, production-ready implementation of this architecture in Node.js, overriding the `dns.lookup` resolver in standard HTTP agents.

```javascript
const http = require('http');
const https = require('https');
const dns = require('dns');
const ipRangeCheck = require('ip-range-check'); // For robust CIDR evaluation

// Define strict internal IP boundaries that outbound requests must NEVER target
const FORBIDDEN_CIDRS = [
    '127.0.0.0/8',       // Loopback
    '10.0.0.0/8',        // RFC 1918 Private Net
    '172.16.0.0/12',     // RFC 1918 Private Net
    '192.168.0.0/16',    // RFC 1918 Private Net
    '169.254.0.0/16',    // Link-Local (AWS/GCP/Azure Metadata Services)
    '0.0.0.0/8',         // Current network broadcast
    '::1/128',           // IPv6 Loopback
    'fc00::/7',          // IPv6 Unique Local Address
    'fe80::/10'          // IPv6 Link-Local
];

/**
 * Custom DNS Lookup Function that performs strict RFC CIDR checks
 */
const secureLookup = (hostname, options, callback) => {
    // Forward query to default resolver
    dns.lookup(hostname, options, (err, address, family) => {
        if (err) {
            return callback(err);
        }

        // Validate that the resolved address does not match forbidden networks
        const isForbidden = ipRangeCheck(address, FORBIDDEN_CIDRS);

        if (isForbidden) {
            console.error(`[SECURITY ALERT] SSRF / Internal IP access attempt blocked: ${hostname} -> ${address}`);
            return callback(new Error('Access Denied: Target address matches private or restricted IP ranges.'));
        }

        // Resolution is valid and safe
        callback(null, address, family);
    });
};

// Create secure HTTP and HTTPS Agents using our secureLookup middleware
const secureHttpAgent = new http.Agent({ lookup: secureLookup });
const secureHttpsAgent = new https.Agent({ lookup: secureLookup });

/**
 * Wrapper function for making SSRF-safe outbound HTTP requests
 */
const fetchRemoteResource = (urlInput) => {
    return new Promise((resolve, reject) => {
        try {
            const parsedUrl = new URL(urlInput);
            
            // Validate protocol is strictly HTTP or HTTPS
            if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
                return reject(new Error('Invalid Protocol: Only HTTP and HTTPS are permitted.'));
            }

            const agent = parsedUrl.protocol === 'https:' ? secureHttpsAgent : secureHttpAgent;

            const requestOptions = {
                hostname: parsedUrl.hostname,
                port: parsedUrl.port,
                path: parsedUrl.pathname + parsedUrl.search,
                method: 'GET',
                agent: agent, // Force the use of our pre-validated resolver agent
                timeout: 3000
            };

            const req = (parsedUrl.protocol === 'https:' ? https : http).request(requestOptions, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => resolve(data));
            });

            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Request timed out'));
            });

            req.on('error', (err) => reject(err));
            req.end();

        } catch (e) {
            reject(new Error('Malformed URL payload provided.'));
        }
    });
};

module.exports = { fetchRemoteResource };
```

---

## Defensive Countermeasures
1. **Disable Cloud IMDSv1:** On cloud infrastructure, disable AWS IMDSv1 and enforce **IMDSv2**, which requires a custom, stateful session token header (`X-aws-ec2-metadata-token`) in every call. Since SSRF vectors often cannot inject custom headers, this mitigates direct metadata extraction.
2. **Isolate Fetching Services (Network Zoning):** Move any microservice that handles external resource fetching into a dedicated, sandboxed network zone (DMZ) with no internal routes to sensitive services or cloud VPC endpoints.
3. **Use Outbound Proxying:** Force all egress fetching traffic through a filtering secure proxy (e.g., Smokescreen or Squid) configured to automatically drop requests originating from loopback or RFC1918-allocated internal ranges.
