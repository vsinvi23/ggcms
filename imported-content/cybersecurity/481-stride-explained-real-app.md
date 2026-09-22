# STRIDE Explained with a Real Application: From Spoofing to Elevation of Privilege

## The Problem: Unstructured Threat Modeling
When engineering teams build new features, the question "Is this secure?" often leads to unstructured brainstorming. Developers guess at vulnerabilities based on recent news or past traumas. This ad-hoc approach inevitably leaves critical architectural flaws undiscovered until they are exploited in production. 

Threat modeling requires a systematic framework to guarantee comprehensive coverage of potential design flaws. The STRIDE methodology, developed by Microsoft, provides this structure. It forces engineers to analyze systems against six specific threat categories: **S**poofing, **T**ampering, **R**epudiation, **I**nformation Disclosure, **D**enial of Service, and **E**levation of Privilege.

To understand STRIDE practically, let's analyze a real-world system: a microservice-based e-commerce checkout flow.

## The Target Architecture
Consider a simplified checkout architecture:

```text
  [User/Browser]
        |
        | (1) HTTPS / API Request
        v
  [API Gateway] -- (2) gRPC --> [Order Service]
                                     |
                                     | (3) TCP / SQL
                                     v
                             [Order Database]
```

This system accepts an order from the user, validates it through the API Gateway, processes the business logic in the Order Service, and persists the record to an SQL database. We will apply the STRIDE framework to the data flows and trust boundaries in this architecture.

---

## 1. Spoofing Identity
**Definition:** An attacker pretending to be someone or something else.
**The Threat:** An attacker alters the `userId` in the checkout API payload to place an order on behalf of another user, using their saved payment methods.

### Vulnerable Implementation
```javascript
// Order Service (Node.js/Express)
app.post('/api/checkout', (req, res) => {
    const { userId, items } = req.body;
    // VULNERABILITY: Trusting client-provided user IDs.
    processOrder(userId, items);
});
```

### Mitigation
Spoofing is mitigated by strong **Authentication**. The API Gateway must validate a cryptographically signed token (like a JWT) and pass the validated identity to downstream services, rather than relying on client-provided IDs.

```javascript
// Order Service (Node.js/Express)
app.post('/api/checkout', (req, res) => {
    // Rely on identity injected by the API Gateway after JWT validation
    const userId = req.headers['x-authenticated-user-id'];
    const { items } = req.body;
    processOrder(userId, items);
});
```

## 2. Tampering with Data
**Definition:** Modifying data in transit or at rest.
**The Threat:** An attacker intercepts the network traffic between the API Gateway and the Order Service (assuming they have breached the internal network) and changes the order total to $0.00.

### Vulnerable Architecture
Internal microservices communicating over plaintext HTTP or TCP, assuming the internal network is "safe."

### Mitigation
Tampering is mitigated by **Integrity** controls. Enforce TLS (mTLS in a service mesh) for all internal communications to ensure data cannot be altered in transit. For data at rest, utilize cryptographic hashes or digital signatures.

## 3. Repudiation
**Definition:** A user performing an action and then falsely claiming they did not.
**The Threat:** A user places a large order, receives the goods, and then disputes the credit card charge, claiming the system was hacked and they never made the purchase. If the system lacks irrefutable logs, the company loses the dispute.

### Vulnerable Implementation
Logging only errors, or logging application state without tying actions directly to an authenticated identity and timestamp.

### Mitigation
Repudiation is countered with strong **Non-repudiation** through exhaustive, tamper-evident audit logging. Every critical action must be logged with the who, what, where, and when.

```javascript
async function processOrder(userId, items) {
    const orderId = generateOrderId();
    // Non-repudiation: Audit log written before processing, 
    // ideally to an append-only datastore.
    await auditLogger.log({
        event: 'ORDER_INTENT',
        userId: userId,
        orderId: orderId,
        payloadHash: crypto.createHash('sha256').update(JSON.stringify(items)).digest('hex'),
        timestamp: new Date().toISOString(),
        ipAddress: request.ip
    });
    // ... proceed with order
}
```

## 4. Information Disclosure
**Definition:** Exposing sensitive information to unauthorized individuals.
**The Threat:** The Order Database returns verbose SQL error messages to the Order Service when a malformed payload is sent. The Order Service blindly passes this error back through the API Gateway to the end-user, revealing database schema details.

### Vulnerable Implementation
```javascript
try {
    await db.query(`INSERT INTO orders ...`);
} catch (error) {
    // VULNERABILITY: Leaking internal system details to the client
    res.status(500).json({ error: error.message }); 
}
```

### Mitigation
Information disclosure is prevented by **Confidentiality** controls. This includes encryption (in transit and at rest) and strict error handling that swallows internal stack traces, returning generic error identifiers to the client.

```javascript
try {
    await db.query(`INSERT INTO orders ...`);
} catch (error) {
    internalLogger.error(error); // Log the real error internally
    // Return a generic, safe error message to the client
    res.status(500).json({ error: 'An unexpected error occurred.', errorCode: 'ERR_ORD_01' }); 
}
```

## 5. Denial of Service (DoS)
**Definition:** Exhausting system resources to make the application unavailable to legitimate users.
**The Threat:** An attacker writes a script to continuously hit the `/api/checkout` endpoint. The Order Service allocates memory and database connections for each request, rapidly exhausting database connection pools and taking down the entire e-commerce platform.

### Vulnerable Architecture
Synchronous, blocking API calls without rate limiting or circuit breakers.

### Mitigation
DoS is mitigated by maximizing **Availability**. Implementing strict rate limiting at the API Gateway, using asynchronous queuing (like Kafka or RabbitMQ) to absorb traffic spikes, and setting timeouts on database queries.

```text
  [API Gateway] -- (Rate Limited) --> [Message Queue] --> [Order Worker]
```

## 6. Elevation of Privilege
**Definition:** An attacker gaining permissions beyond what they were initially granted.
**The Threat:** The API Gateway correctly authenticates the user. However, the user modifies the API payload to include `"role": "admin"`. The Order Service blindly deserializes this payload and merges it into the user object, granting the attacker administrative access to view all orders in the system.

### Vulnerable Implementation
Mass assignment vulnerabilities in object-relational mapping (ORM) libraries.

```javascript
// Vulnerable mass assignment
const userUpdates = req.body; 
// If req.body contains { role: 'admin' }, the user is elevated.
await User.update(userId, userUpdates); 
```

### Mitigation
Elevation of Privilege is mitigated by strict **Authorization**. Applications must use explicit Data Transfer Objects (DTOs) and allowlists to map only permitted fields from external input to internal data models. Never trust client-provided role or permission data.

```javascript
// Secure specific assignment
const { firstName, lastName, shippingAddress } = req.body;
await User.update(userId, { firstName, lastName, shippingAddress });
// 'role' is explicitly ignored.
```

## Conclusion
STRIDE is not a checklist of specific bugs (like SQLi or XSS); it is a lens through which to view architectural data flows. By systematically questioning how an attacker could Spoof, Tamper, Repudiate, Disclose, Deny, or Elevate at every trust boundary, engineering teams transition from reactive patching to proactive secure design.