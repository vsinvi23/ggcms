# HTTP Request Smuggling: Exploiting Frontend/Backend Desync Vulnerabilities

## The Problem

HTTP Request Smuggling (HRS) is an advanced attack vector that exploits a discrepancy in how RFC compliance is handled across different nodes in a web infrastructure. When an enterprise architecture routes traffic through a frontend reverse proxy (e.g., Nginx, AWS ALB, Cloudflare) before forwarding it to backend application servers (e.g., Node.js, Tomcat, Gunicorn), a desynchronization vulnerability can occur if the servers interpret HTTP headers differently.

Specifically, the attack relies on the manipulation of the `Content-Length` (CL) and `Transfer-Encoding` (TE) headers. Under RFC 7230, if a message contains both headers, the `Content-Length` must be ignored in favor of `Transfer-Encoding`. However, some older, non-compliant, or legacy parsers fail to enforce this, or can be tricked by obfuscated headers (e.g., `Transfer-Encoding: xchunked` or trailing whitespace). If the frontend proxy parses the request using one header, and the backend server parses it using the other, the boundaries of the HTTP request streams desynchronize. An attacker can construct a single request that contains a "smuggled" request. This smuggled request is left sitting on the backend's persistent connection buffer, prepending itself to the *next* victim's legitimate HTTP request.

---

## Desync Topologies & Architectures

There are three primary desync configurations depending on which header is honored by each server:

1. **CL.TE**: Frontend honors `Content-Length`, Backend honors `Transfer-Encoding`.
2. **TE.CL**: Frontend honors `Transfer-Encoding`, Backend honors `Content-Length`.
3. **TE.TE**: Both frontend and backend honor `Transfer-Encoding`, but one can be tricked into ignoring it by header obfuscation.

### CL.TE Request Smuggling Attack Flow
```
[ Attacker Request ] ────────────────► [ Frontend Proxy ] ────────────────► [ Backend Server ]
  CL: 154 (honored)                     Forwarded as single request         CL: 154 (ignored)
  TE: chunked                                                                TE: chunked (honored)
                                                                             - Reads chunk up to '0'
                                                                             - Leaves 'Smuggled req' 
                                                                               in TCP socket buffer!
                                                                                    │
                                                                                    ▼
[ Victim Request ] ──────────────────► [ Frontend Proxy ] ────────────────► [ Backend Server ]
  GET /index.html                      Forwarded normally                    Concatenates:
                                                                             [Smuggled req][Victim req]
                                                                             Executes smuggled action!
```

---

## Defensive Implementation: Request Gating & Header Normalization

To secure our backend and proxy architecture, we must enforce a zero-tolerance policy for ambiguous and non-standard HTTP requests. Below is a production-grade Node.js/TypeScript Express middleware that rigorously validates incoming headers to prevent desynchronization attacks before payload routing.

```typescript
import { Request, Response, NextFunction } from 'express';

/**
 * Express middleware to prevent HTTP Request Smuggling by detecting
 * and rejecting requests containing both Content-Length and Transfer-Encoding,
 * or possessing malformed/obfuscated headers.
 */
export function requestSmugglingGuard(req: Request, res: Response, next: NextFunction): void {
    const headers = req.headers;

    // 1. Detect presence of both CL and TE headers (RFC 7230 violation)
    const hasContentLength = headers['content-length'] !== undefined;
    const hasTransferEncoding = headers['transfer-encoding'] !== undefined;

    if (hasContentLength && hasTransferEncoding) {
        res.status(400).send('Bad Request: Ambiguous message boundaries (both CL and TE present).');
        return;
    }

    // 2. Scan for duplicate or multiple Content-Length headers
    const rawContentLength = req.rawHeaders.filter(h => h.toLowerCase() === 'content-length');
    if (rawContentLength.length > 1) {
        res.status(400).send('Bad Request: Multiple Content-Length headers detected.');
        return;
    }

    // 3. Scan for Transfer-Encoding obfuscation attempts (e.g., whitespace, multiple encodings)
    if (hasTransferEncoding) {
        const teValue = String(headers['transfer-encoding']).trim().toLowerCase();
        
        // Strict check: if TE is present, it MUST end with 'chunked'
        if (!teValue.endsWith('chunked')) {
            res.status(400).send('Bad Request: Unsupported or malformed Transfer-Encoding.');
            return;
        }

        // Detect dangerous combinations like 'chunked, identity'
        if (teValue.includes('identity') || teValue.split(',').length > 1) {
            res.status(400).send('Bad Request: Obfuscated or chained Transfer-Encoding.');
            return;
        }
    }

    // 4. Strip dangerous control characters from raw header keys and values
    // to prevent parser interpretation mismatches
    for (let i = 0; i < req.rawHeaders.length; i += 2) {
        const key = req.rawHeaders[i];
        const val = req.rawHeaders[i + 1];
        
        if (/[\r\n\t]/.test(key) || /[\r\n\t]/.test(val)) {
            res.status(400).send('Bad Request: Forbidden characters in HTTP headers.');
            return;
        }
    }

    next();
}
```

---

## Architectural Mitigation & Best Practices

1. **Adopt HTTP/2 or HTTP/3 End-to-End**: HTTP/2 uses binary framing rather than textual delimiters to define request boundaries. Smuggling is fundamentally impossible in HTTP/2. Migrate backend communication to HTTP/2 to completely eliminate the CL/TE ambiguity.
2. **Disable Connection Reuse (Keep-Alive) Mismatches**: If possible, configure frontend proxies to run on HTTP/2 frontend-side and translate to strict HTTP/1.1 backend-side *without* connection multiplexing on a shared socket pool, or reuse separate backend connections for different client contexts.
3. **Use WAF Rules**: Deploy a high-quality Web Application Firewall (WAF) to sanitize incoming requests, stripping any request containing malformed whitespace in the headers.
