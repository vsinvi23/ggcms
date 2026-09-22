# Threat Modeling from Scratch: DFDs and Trust Boundaries

## The Problem
Security is historically bolted onto applications right before deployment. Penetration testers are hired to hack a nearly finished product. Finding a fundamental architectural flaw at this stage is catastrophic, requiring massive code refactoring. 

Threat modeling shifts security left to the design phase. It is the practice of systematically identifying structural vulnerabilities before a single line of code is written.

## 1. The Data Flow Diagram (DFD)
You cannot secure what you cannot see. The first step in threat modeling is drawing a Data Flow Diagram. Unlike standard architecture diagrams that focus on network topology or compute resources, a DFD tracks how data moves, where it is stored, and who interacts with it.

### Core Elements of a DFD:
- **Entities (Rectangles):** External actors (User, Third-party API).
- **Processes (Circles):** Code that manipulates data (Web App, Auth Service).
- **Data Stores (Parallel Lines):** Where data rests (Database, S3, Cache).
- **Data Flows (Arrows):** The path data takes between components.

## 2. Defining Trust Boundaries
The most critical addition to a DFD for security purposes is the **Trust Boundary** (represented by a dashed red line). A trust boundary marks the perimeter where data changes its level of trust. 

*Rule: Every time data crosses a trust boundary, it must be authenticated and validated.*

### ASCII DFD Example for a Simple Web App

```text
[ User (Web Browser) ]
          |
          | (1. HTTP POST /login)
          V
====================================== [ TRUST BOUNDARY 1: Internet to DMZ ]
          |
   (2. Web Firewall)
          |
    (3. Nginx / React)
          |
====================================== [ TRUST BOUNDARY 2: DMZ to Internal API ]
          |
    (4. Auth API) <===========> [ Data Store: User DB ]
          |
====================================== [ TRUST BOUNDARY 3: Internal to Third-Party ]
          |
  (5. Third-Party Identity Provider)
```

## 3. The STRIDE Methodology
Once the DFD is drawn and boundaries are established, you iterate through every component, data flow, and boundary using the **STRIDE** methodology (developed by Microsoft). STRIDE forces you to ask specific questions about potential threats.

1. **S - Spoofing (Identity):** Can an attacker pretend to be someone else?
   * *Analysis at Boundary 1:* Does the `POST /login` flow have brute-force protection? Can someone spoof a session cookie?
2. **T - Tampering (Integrity):** Can an attacker modify data in transit or at rest?
   * *Analysis at Data Store:* Are database backups encrypted and hashed? If an attacker alters the DB directly, will the Auth API notice?
3. **R - Repudiation (Non-repudiation):** Can an attacker perform an action and plausibly deny it?
   * *Analysis at Auth API:* Are we logging every login attempt, success, and failure? Are logs shipped to a write-only, centralized SIEM?
4. **I - Information Disclosure (Confidentiality):** Can an attacker view data they shouldn't?
   * *Analysis at Flow 4:* Is the connection between the Auth API and the DB using TLS, or is it plaintext HTTP inside the VPC?
5. **D - Denial of Service (Availability):** Can an attacker crash the system?
   * *Analysis at Entity 1:* What happens if the User sends 10,000 login requests per second? Will the DB connection pool exhaust?
6. **E - Elevation of Privilege (Authorization):** Can a regular user gain admin rights?
   * *Analysis at Boundary 2:* If a user manipulates their JWT payload from `role: user` to `role: admin`, does the Auth API re-verify the signature before accepting it?

## Applying Threat Modeling in Code
Threat modeling directly dictates the engineering backlog. For example, identifying an Information Disclosure threat across Trust Boundary 2 mandates the following code implementation:

```javascript
// Threat Mitigation: Information Disclosure via overly verbose error handling
app.post('/api/data', async (req, res) => {
    try {
        const data = await db.query(req.body);
        res.json(data);
    } catch (error) {
        // BAD: Leaks DB schema details across the trust boundary
        // res.status(500).send(error.message); 
        
        // GOOD: Log the detail internally, return safe generic message
        logger.error(`DB Query failed: ${error.stack}`);
        res.status(500).json({ error: "An internal server error occurred." });
    }
});
```

By drawing DFDs, marking Trust Boundaries, and applying STRIDE, security stops being a guessing game and becomes a deterministic engineering process.