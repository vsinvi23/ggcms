# Authorization Architecture Explained: Enforcement vs. Decision Points

## The Problem: Spaghetti Authorization
Once an application knows *who* a user is (Authentication), it must determine *what* they are allowed to do (Authorization). 

In many codebases, authorization logic is scattered haphazardly throughout the application. It lives in UI components hiding buttons, in API middleware checking roles, and buried deep within SQL queries filtering rows.

```javascript
// Anti-Pattern: Spaghetti Authorization
app.post('/api/documents/:id/delete', (req, res) => {
    // AuthZ logic hardcoded directly into the business logic
    if (req.user.role === 'admin' || (req.user.role === 'manager' && req.user.department === 'HR')) {
        db.deleteDocument(req.params.id);
        res.send("Deleted");
    } else {
        res.status(403).send("Forbidden");
    }
});
```

This approach leads to disastrous vulnerabilities. When authorization rules change (e.g., "Managers can no longer delete documents"), engineers must hunt down every scattered `if` statement. If they miss one, the system is breached.

Robust systems decouple authorization logic from business logic using a formal architecture: the **Policy Enforcement Point (PEP)** and the **Policy Decision Point (PDP)**.

## The PEP / PDP Architecture

This architecture is derived from the XACML (eXtensible Access Control Markup Language) standard, though you don't need to use XML to apply the concepts.

### 1. The Policy Enforcement Point (PEP)
The PEP is the bouncer at the door. It lives inside your application code (often as middleware or an API Gateway). 
*   **The PEP does NOT know the rules.** 
*   Its only job is to intercept a request, pause execution, and ask the PDP: *"Is User X allowed to perform Action Y on Resource Z?"*
*   If the PDP says "Yes," the PEP lets the request proceed to the business logic. If "No," it throws a 403 Forbidden.

### 2. The Policy Decision Point (PDP)
The PDP is the brain. It contains all the authorization rules (policies). 
*   When asked a question by the PEP, the PDP evaluates the user's attributes, the resource's attributes, and the environmental context against its centralized policies.
*   It returns a strict boolean decision: `Allow` or `Deny`.

### 3. The Policy Information Point (PIP)
Sometimes the PDP needs more information to make a decision. For example, if the policy is "Users can only edit documents they own," the PDP needs to look up the document's owner in the database. The PIP is the integration layer that fetches this external context for the PDP.

## Visualizing the Flow

```text
[ User Request ] --> DELETE /documents/123
                          |
                 +-------------------+
                 | API Gateway / App |
                 |       (PEP)       | --- "Can Alice DELETE Doc123?" --> +-------------+
                 +-------------------+                                    | AuthZ Engine|
                          |                                               |    (PDP)    |
                 (Wait for decision...) <---------- "Deny" -------------- +-------------+
                          |                                                      |
                  [ 403 Forbidden ]                                       (Needs context?)
                                                                                 |
                                                                          +-------------+
                                                                          |  Database   |
                                                                          |    (PIP)    |
                                                                          +-------------+
```

## Implementing PEP and PDP in Code

Let's refactor our spaghetti example using a modern Authorization-as-a-Service model (like Open Policy Agent (OPA) or Oso).

### Step 1: The Centralized Policy (The PDP)
We extract the logic out of the JavaScript and write it in a dedicated policy language (like Rego, used by OPA). This policy is managed separately, often in its own Git repository.

```rego
# policy.rego (Evaluated by the PDP)
package document.authz

default allow = false

# Admins can do anything
allow {
    input.user.role == "admin"
}

# Managers can delete HR documents
allow {
    input.user.role == "manager"
    input.user.department == "HR"
    input.action == "delete"
    input.resource.type == "document"
}
```

### Step 2: The Clean Application Code (The PEP)
The application code is now completely stripped of business rules. It acts strictly as an enforcement point.

```javascript
// The PEP (Middleware)
async function authorize(req, res, next) {
    // 1. Gather context
    const authzQuery = {
        user: req.user, // From JWT
        action: 'delete',
        resource: { type: 'document', id: req.params.id }
    };

    // 2. Ask the PDP (e.g., calling out to the OPA sidecar)
    const decision = await pdpClient.evaluate("document/authz/allow", authzQuery);

    // 3. Enforce the decision
    if (decision.result === true) {
        next(); // Proceed to business logic
    } else {
        res.status(403).send("Forbidden");
    }
}

// Business Logic (Clean and unaware of AuthZ rules)
app.post('/api/documents/:id/delete', authorize, (req, res) => {
    db.deleteDocument(req.params.id);
    res.send("Deleted");
});
```

## Types of Access Control Models

When writing policies for the PDP, engineers typically rely on one of three models:

1.  **RBAC (Role-Based Access Control):** Permissions are tied to roles (e.g., `Admin`, `Editor`). Users are assigned to roles. *Simple, but inflexible.*
2.  **ABAC (Attribute-Based Access Control):** Permissions are evaluated dynamically based on attributes of the user, the resource, and the environment (e.g., "Allow if `user.department == resource.department` AND `time < 5pm`"). *Highly flexible, but complex.*
3.  **ReBAC (Relationship-Based Access Control):** Permissions are derived from a graph of relationships (e.g., Google Drive sharing, where Alice can edit because she is in the `Engineering Group`, which is a `member` of the `Project Folder`, which `contains` the Document). *Ideal for modern SaaS.*

## Conclusion
Do not hardcode authorization checks into your controllers or business logic. By decoupling the Policy Enforcement Point (the dumb bouncer) from the Policy Decision Point (the smart brain), engineering teams create systems that are vastly easier to audit, update, and secure against privilege escalation attacks.