# Broken Access Control: Bypassing UI Security Filters on API Endpoints

## The Problem: The Client-Side Security Illusion

Access control determines whether an authenticated user is permitted to perform a specific action or access a specific resource. It is the core of application authorization. 

The most pervasive and dangerous access control vulnerability arises when developers implement authorization rules exclusively within the frontend UI, rather than at the backend API gateway. In modern Single Page Applications (SPAs) built with React, Vue, or Angular, it is tempting to simply "hide" buttons or routes from unauthorized users.

However, the frontend runs entirely in the user's browser. An attacker using proxy tools like Burp Suite or simply analyzing network traffic via browser DevTools can identify the backend API routes and interact with them directly. If the backend API assumes that "only admins can see the button, therefore only admins are making this request," the application suffers from Broken Access Control.

## Architectural Flaw: The UI-Only Defense

Consider a SaaS platform with two roles: `User` and `Admin`. 

**The Frontend Implementation (Vulnerable):**

```javascript
// React Component: AdminDashboard.jsx
function Dashboard({ user }) {
  return (
    <div>
      <h1>Dashboard</h1>
      {/* Flaw: Hiding the UI element does not secure the API */}
      {user.role === 'Admin' && (
        <button onClick={() => fetch('/api/v1/system/purge_logs', { method: 'POST' })}>
          Purge System Logs
        </button>
      )}
    </div>
  );
}
```

**The Backend Implementation (Vulnerable):**

```python
# FastAPI Backend
@app.post("/api/v1/system/purge_logs")
def purge_logs(current_user: User = Depends(get_authenticated_user)):
    # Flaw: The backend verifies the user is LOGGED IN, 
    # but fails to verify if they are an ADMIN.
    database.purge_all_logs()
    return {"status": "Logs purged"}
```

**The Exploit:**
1. A standard `User` logs in. They do not see the "Purge System Logs" button.
2. The user inspects the Javascript bundle and discovers the `/api/v1/system/purge_logs` endpoint.
3. Using Postman or cURL, the user crafts a `POST` request to that endpoint, including their valid `User` session token.
4. The backend authenticates the token, ignores the role, and executes the destructive action.

```text
[ Standard User ] --(cURL POST /api/v1/system/purge_logs)--> [ API Gateway ]
                                                                    |
                                                            [ Auth Token Valid? YES ]
                                                                    |
                                                            [ Role Checked? NO  ]
                                                                    |
                                                            [ Executes Action ] ---> Catastrophe
```

## Defense Strategy: Backend-Enforced Zero Trust Authorization

Security controls in the UI exist purely for User Experience (UX), not security. True authorization must occur on the server, evaluated on *every single request*.

### 1. Centralized Role-Based Access Control (RBAC)

Implement a centralized authorization middleware or decorator that intercepts requests before they reach the business logic controller. 

**Secure Python (FastAPI) Implementation:**

```python
from fastapi import Depends, HTTPException, status

# 1. Define strict role hierarchies
def require_role(required_role: str):
    def role_checker(current_user: User = Depends(get_authenticated_user)):
        if current_user.role != required_role:
            # 2. Fail closed. Reject unauthorized attempts instantly.
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient privileges to perform this action."
            )
        return current_user
    return role_checker

# 3. Apply the authorization decorator explicitly to the route
@app.post("/api/v1/system/purge_logs", dependencies=[Depends(require_role("Admin"))])
def purge_logs():
    database.purge_all_logs()
    return {"status": "Logs purged"}
```

### 2. Attribute-Based Access Control (ABAC) for Complex Logic

RBAC (Admin vs. User) is often insufficient for modern applications. Frequently, authorization depends on ownership: "A user can edit a document, but *only* if they are the creator of that specific document."

This requires Attribute-Based Access Control (ABAC), where the authorization logic must query the database to verify the relationship between the user and the requested resource.

**Secure Node.js (Express) Implementation:**

```javascript
// Middleware to verify ownership of a specific resource
async function verifyDocumentOwnership(req, res, next) {
    const documentId = req.params.doc_id;
    const userId = req.user.id; // Extracted from valid session token

    // Query DB to check relationship
    const document = await db.documents.findOne({ id: documentId });

    if (!document) {
        return res.status(404).send("Document not found");
    }

    if (document.owner_id !== userId) {
        // Log the access violation attempt for security auditing
        securityLogger.warn(`User ${userId} attempted unauthorized access to Doc ${documentId}`);
        return res.status(403).send("Forbidden");
    }

    // Authorization passed, proceed to business logic
    req.document = document; 
    next();
}

// Route definition enforces the middleware
app.put('/api/v1/documents/:doc_id', requireAuth, verifyDocumentOwnership, (req, res) => {
    // Safely update the document
    updateDocument(req.document, req.body);
    res.send("Updated");
});
```

### 3. Fail-Closed Default Configuration

Ensure that your API framework defaults to denying access. If a new route is added by a developer and they forget to append an authorization decorator, the framework should throw a 500 error or block access entirely, rather than defaulting to public access. 

## Conclusion

Broken Access Control thrives in the gap between frontend UX design and backend API implementation. Hiding UI elements is entirely ineffective against targeted API attacks. Security engineers must mandate a Zero Trust architecture where the backend explicitly, consistently, and independently verifies the permissions (RBAC) and ownership rights (ABAC) of the authenticated entity on every single state-altering request.
