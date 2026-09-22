# OWASP Top 10: Mapping Vulnerabilities to Software Architecture Layers

## The Problem: Superficial Security Checklists
Standard security implementations frequently treat the OWASP Top 10 as an arbitrary checklist applied solely during final quality assurance. Developers throw a generic Web Application Firewall (WAF) at the edge or run automated scanners the night before release, hoping to check the box. This superficial approach fails because security vulnerabilities are rarely isolated to a single layer. 

An SQL injection is a database layer failure triggered by poor application layer coding. Broken access control is an authorization domain leak spanning API routing and domain logic layers. To build resilient applications, security must be systematically designed into each tier of the software architecture.

---

## Architectural View: Vulnerability Mappings Across Layers
To implement defense-in-depth, security controls must align with the specific layers where vulnerabilities manifest.

```
+-------------------------------------------------------------------------+
| Edge Layer (WAF / CDN / CDN Shield)                                     |
| -> Mitigates: Distributed Denial of Service (DDoS), Brute Force, SSRF   |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| API Gateway / Routing Layer                                             |
| -> Mitigates: Broken Object Level Auth (BOLA), Rate Limiting, CORS      |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Authentication & Identity Provider (IdP)                                |
| -> Mitigates: Broken Authentication, Session Hijacking, Weak Passwords |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Application Business Logic / Controller Tier                            |
| -> Mitigates: Broken Function Level Auth, Injection, XSS, SSRF          |
+-------------------------------------------------------------------------+
                                     |
                                     v
+-------------------------------------------------------------------------+
| Persistence Layer (SQL / NoSQL / Cache)                                 |
| -> Mitigates: Injection, Sensitive Data Exposure, Insecure Deserialization|
+-------------------------------------------------------------------------+
```

---

## Technical Deep Dive: Layered Gateway Middleware
The following Node.js Express implementation models a production-ready API Gateway security wrapper. It orchestrates three critical layers of defense before forwarding traffic to sensitive business microservices: structural content security, token authorization, and automated query safety controls.

```javascript
const express = require('express');
const helmet = require('helmet');
const jwt = require('jsonwebtoken');

const app = express();

// --- LAYER 1: Edge / Transport Security Headers (Using Helmet) ---
// Enforces standard secure headers to prevent Clickjacking, MIME-sniffing, and basic XSS
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    referrerPolicy: { policy: 'no-referrer' }
}));

// Strictly limit parsing of incoming JSON payloads to prevent Denial of Service (DoS) payload exhaustion
app.use(express.json({ limit: '10kb' }));

// --- LAYER 2: Decentralized Cryptographic Authentication Validation ---
// Decouples session logic by verifying token integrity at the gateway border
const verifyGatewayAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or malformed Authorization token' });
    }

    const token = authHeader.split(' ')[1];
    try {
        // Verify token with an asymmetric public key (using a mock secret here for demonstration)
        const decoded = jwt.verify(token, process.env.JWT_PUBLIC_KEY || 'gateway-super-secret');
        
        // Populate strict internal context
        req.userContext = {
            id: decoded.sub,
            role: decoded.role,
            tenantId: decoded.tenantId
        };
        next();
    } catch (err) {
        return res.status(403).json({ error: 'Invalid or expired cryptographic signature' });
    }
};

// --- LAYER 3: Authorization Boundary Verification (BOLA/BAC Control) ---
// Prevents Broken Object Level Auth (BOLA) by strictly matching identity to resource context
const enforceTenantIsolation = (req, res, next) => {
    const requestedTenantId = req.params.tenantId;
    
    if (!req.userContext) {
        return res.status(500).json({ error: 'Internal context failure: security layers misaligned' });
    }
    
    // Explicit tenant assertion: users can NEVER query data belonging to other tenants
    if (req.userContext.role !== 'SUPER_ADMIN' && req.userContext.tenantId !== requestedTenantId) {
        console.warn(`[SECURITY ALERT] Tenant boundary bypass attempt: User ${req.userContext.id} tried accessing Tenant ${requestedTenantId}`);
        return res.status(403).json({ error: 'Access Denied: Resource isolation breach' });
    }
    next();
};

// --- API Endpoint Implementing Layered Security ---
app.get('/api/v1/tenants/:tenantId/billing', verifyGatewayAuth, enforceTenantIsolation, (req, res) => {
    // Business logic execution layer is guaranteed to have validated security context
    const tenantId = req.params.tenantId;
    res.status(200).json({
        status: 'success',
        tenantId: tenantId,
        data: {
            currentPeriodTotal: 14500.50,
            currency: 'USD',
            paymentMethod: 'cryptographically-masked-profile'
        }
    });
});

// Global error handler to catch unhandled application crashes and prevent stack trace leaks
app.use((err, req, res, next) => {
    console.error(`[CRITICAL ERROR] Unhandled system error: ${err.message}`, err.stack);
    res.status(500).json({ error: 'Internal Server Error' });
});

module.exports = app;
```

---

## Strategic Architecture Recommendations
To build structurally secure software across all layers:

1. **Centralize Security Middlewares:** Do not replicate validation logic on individual routes. Configure policies globally at the gateway or upstream reverse proxy.
2. **Implement Structural Type Safety:** Use libraries like `zod` or `joi` immediately at the controller layer to validate input shapes.
3. **Decouple Identity & Authorization:** Authenticate at the edge or gateway, but perform granular authorization checks at the core service level where direct object knowledge is available.
