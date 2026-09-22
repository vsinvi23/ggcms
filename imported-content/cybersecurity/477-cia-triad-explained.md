# The CIA Triad Explained Through Real Incidents

## The Problem
The CIA Triad (Confidentiality, Integrity, Availability) is the foundational model of information security. However, it is often taught as an abstract, academic concept. Developers often treat it as compliance filler, struggling to map it to actual architectural decisions. To understand the CIA Triad, you must examine it through the lens of catastrophic real-world engineering failures.

## The Architecture of the Triad
Every security control exists to protect one or more of these three pillars across three states of data (In Transit, At Rest, In Use).

```text
              [ CONFIDENTIALITY ]
              Keep secrets secret.
                    /   \
                   /     \
                  /       \
                 /         \
[ AVAILABILITY ]-------------[ INTEGRITY ]
Keep systems running.     Keep data accurate & unaltered.
```

## 1. Confidentiality: The Equifax Breach (2017)
**Definition:** Ensuring that information is not made available or disclosed to unauthorized individuals, entities, or processes.

**The Incident:** In 2017, attackers exploited a known vulnerability (CVE-2017-5638) in the Apache Struts web framework used by the credit reporting agency Equifax. Because the internal networks lacked proper segmentation and the databases holding PII (Personally Identifiable Information) were not sufficiently encrypted at rest, the attackers spent 76 days extracting the personal data (SSNs, birth dates, addresses) of 147 million people.

**The Engineering Failure:**
- Lack of network segmentation allowed attackers to move laterally from the web server to the core databases.
- Lack of encryption at rest meant that once the database was reached, the data was readable in plaintext.

**Code/Architecture Mitigation (Confidentiality):**
- Implement strict Role-Based Access Control (RBAC).
- Encrypt data at rest (AES-256) and in transit (TLS 1.3).
- Utilize Key Management Services (KMS) rather than hardcoded credentials.

## 2. Integrity: The SolarWinds Supply Chain Attack (2020)
**Definition:** Maintaining and assuring the accuracy and completeness of data over its entire lifecycle. Data cannot be modified in an unauthorized or undetected manner.

**The Incident:** Attackers compromised the build environment of SolarWinds, a prominent IT management software provider. The attackers did not steal data (Confidentiality) or shut down the servers (Availability). Instead, they injected malicious, backdoor code into the legitimate SolarWinds Orion software update (named SUNBURST). When SolarWinds customers downloaded the digitally signed, "official" update, they unknowingly installed the backdoor into their own networks.

**The Engineering Failure:**
- The CI/CD build pipeline was compromised.
- The integrity of the software artifact was violated at the source, meaning the digital signatures applied later verified a malicious binary.

**Code/Architecture Mitigation (Integrity):**
- Cryptographic hashing (SHA-256) to verify file integrity.
- Immutable, isolated build environments with strict audit logging.
- Code signing and reproducible builds.

## 3. Availability: The Dyn DNS DDoS Attack (2016)
**Definition:** Ensuring that systems, networks, and applications are functioning and accessible to authorized users when needed.

**The Incident:** In 2016, a massive Distributed Denial of Service (DDoS) attack targeted Dyn, a major DNS provider. The attack was powered by the Mirai botnet—hundreds of thousands of compromised Internet of Things (IoT) devices (cameras, DVRs). By flooding Dyn's infrastructure with an unprecedented volume of junk traffic (up to 1.2 Tbps), the servers collapsed. Major platforms relying on Dyn, including Twitter, Netflix, Reddit, and GitHub, became completely inaccessible to users.

**The Engineering Failure:**
- A critical infrastructure choke point (DNS) lacked the elasticity and scrubbing capacity to absorb massive, distributed volumetric attacks.

**Code/Architecture Mitigation (Availability):**
- Multi-region redundancy, Load Balancing, and Auto-Scaling.
- DDoS mitigation services (e.g., Cloudflare, AWS Shield) acting as traffic scrubbers.
- Rate limiting and throttling at the API Gateway layer.

```javascript
// Example: Basic Rate Limiting to protect Availability in Node/Express
const rateLimit = require('express-rate-limit');

const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // Limit each IP to 100 requests per windowMs
    message: "Too many requests from this IP, please try again later."
});

app.use('/api/', apiLimiter);
```

By viewing architectures through the lens of Equifax, SolarWinds, and Dyn, the CIA triad stops being academic. It becomes a blueprint for identifying where your system will leak, where it can be poisoned, and how it can be knocked offline.