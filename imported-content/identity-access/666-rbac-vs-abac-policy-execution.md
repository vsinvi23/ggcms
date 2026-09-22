# Role-Based vs Attribute-Based Access Control: Policy Decision Points (PDP) in Microservices

## The Problem: Role Explosion and Static Permissions
In early application development, Role-Based Access Control (RBAC) is the standard. Users are assigned roles (e.g., `Admin`, `Editor`, `Viewer`), and application logic checks these roles before performing actions (`if (user.roles.includes('Editor')) { editPost(); }`).

As systems scale into distributed microservices and multi-tenant architectures, RBAC suffers from **Role Explosion**. If an editor should only edit posts in their specific department, and only during business hours, you end up creating roles like `Finance_Editor_DayShift`. 

Furthermore, embedding authorization logic inside the microservice codebase couples the service tightly to the business rules. Updating a security policy requires recompiling and redeploying the microservice.

## The Solution: Attribute-Based Access Control (ABAC) and External PDPs
Attribute-Based Access Control (ABAC) solves this by evaluating policies based on dynamic attributes:
1. **User Attributes:** Department, security clearance, location.
2. **Resource Attributes:** Sensitivity classification, owner ID, project ID.
3. **Environmental Attributes:** Time of day, IP address, threat level.

To decouple this complex logic from the microservice, we introduce a **Policy Decision Point (PDP)**. The microservice acts only as a **Policy Enforcement Point (PEP)**. Before a microservice performs an action, it asks the PDP, "Can User X perform Action Y on Resource Z given Environment W?" The PDP evaluates an external, centrally managed policy (often written in a language like Rego via Open Policy Agent - OPA) and returns an `Allow` or `Deny` decision.

## Architectural Flow
```text
  [Client]
     | 1. PUT /api/documents/123 (Auth: Bearer JWT)
     V
  [API Gateway] -- Validates JWT Signature --> [IdP]
     |
     | 2. Forwards Request + JWT
     V
  [Document Microservice (PEP)] 
     |
     | 3. Authz Request: 
     |    { user: "alice", action: "write", resource: { id: 123, dept: "finance" } }
     |===============================================> [Open Policy Agent (PDP)]
     |                                                        | 4. Evaluates Rego Policy
     |<=============================================== (Allow: true)
     | 5. Policy Decision: ALLOW
     V
  (Updates Document in Database)
```

## Implementation: OPA Policy (Rego) and PEP Integration
Using Open Policy Agent (OPA) allows us to write ABAC policies as code, which can be version-controlled, tested, and pushed to the PDP dynamically.

### 1. The ABAC Policy (Rego)
```rego
package document.authz

import future.keywords.if
import future.keywords.in

default allow := false

# Rule 1: Admins can do anything
allow if {
    "admin" in input.user.roles
}

# Rule 2: Users can update documents IF they are in the same department
# AND the document is not marked 'classified'
allow if {
    input.action == "update"
    input.user.department == input.resource.department
    input.resource.classification != "classified"
}

# Rule 3: Time-based restriction (Environmental Attribute)
allow if {
    input.action == "update"
    time.clock([time.now_ns(), "America/New_York"])[3] < 18 # Before 6 PM
}
```

### 2. The Policy Enforcement Point (Go Microservice)
```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
)

type AuthzRequest struct {
	Input struct {
		User     UserContext     `json:"user"`
		Action   string          `json:"action"`
		Resource ResourceContext `json:"resource"`
	} `json:"input"`
}

// Intercepts the request and asks OPA for a decision
func CheckAuthorization(user UserContext, action string, resource ResourceContext) bool {
	reqData := AuthzRequest{}
	reqData.Input.User = user
	reqData.Input.Action = action
	reqData.Input.Resource = resource

	payload, _ := json.Marshal(reqData)
	
	// Query the local OPA sidecar
	resp, err := http.Post("http://localhost:8181/v1/data/document/authz/allow", "application/json", bytes.NewBuffer(payload))
	if err != nil {
		return false // Fail closed
	}
	defer resp.Body.Close()

	var opaResult struct {
		Result bool `json:"result"`
	}
	json.NewDecoder(resp.Body).Decode(&opaResult)

	return opaResult.Result
}

// Example API Handler
func UpdateDocumentHandler(w http.ResponseWriter, r *http.Request) {
    // 1. Extract user from JWT
    user := extractUserContext(r)
    
    // 2. Fetch resource metadata (e.g., from DB)
    docID := getDocIdFromURL(r)
    resourceMeta := fetchDocumentMetadata(docID)
    
    // 3. Delegate to PDP
    if !CheckAuthorization(user, "update", resourceMeta) {
        http.Error(w, "Access Denied by Policy", http.StatusForbidden)
        return
    }
    
    // 4. Perform Action
    executeDocumentUpdate()
    w.WriteHeader(http.StatusOK)
}
```

## Engineering Considerations
1. **Network Latency:** Calling an external PDP for every request adds latency. Deploy the PDP (like OPA) as a sidecar container in the same Kubernetes pod as the microservice to keep network calls localized to localhost.
2. **Data Filtering vs. Authorization:** A PDP can tell you if Alice can read Document 123. It is less efficient at answering "List all documents Alice can read." For listing queries, ABAC policies often need to be translated into database `WHERE` clauses (e.g., using OPA's partial evaluation capabilities to generate SQL).
3. **Fail-Closed:** The PEP must always fail closed. If the PDP is unreachable or returns a malformed response, the microservice must reject the request.