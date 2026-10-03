---
title: "RBAC vs. ABAC: Policy Decision Points in Microservices"
description: "How to decouple authorization from microservice code using an external Policy Decision Point (OPA), with a Go Policy Enforcement Point implementation and engineering trade-offs around latency and list queries."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "rbac"
  - "abac"
  - "open-policy-agent"
  - "policy-decision-point"
  - "policy-enforcement-point"
  - "authorization"
---

# RBAC vs. ABAC: Policy Decision Points in Microservices

## The Problem: Role Explosion and Authorization Logic Baked into Code

In early application development, Role-Based Access Control (RBAC) is the standard: users are assigned roles (`Admin`, `Editor`, `Viewer`), and application code checks those roles before performing actions — `if (user.roles.includes('Editor')) { editPost(); }`.

As systems scale into distributed microservices and multi-tenant architectures, RBAC suffers from **role explosion**. If an editor should only edit posts in their own department, and only during business hours, you end up creating roles like `Finance_Editor_DayShift`. Every new business rule multiplies the role count.

Worse, embedding authorization logic inside the microservice codebase couples the service tightly to business rules that change on a different cadence than the code does. Updating a security policy means recompiling and redeploying the microservice.

## The Solution: ABAC and an External Policy Decision Point

Attribute-Based Access Control (ABAC) evaluates policies against dynamic attributes instead of static roles:

1. **User attributes**: department, security clearance, location.
2. **Resource attributes**: sensitivity classification, owner ID, project ID.
3. **Environmental attributes**: time of day, IP address, threat level.

To decouple this logic from the microservice, introduce a **Policy Decision Point (PDP)**. The microservice becomes only a **Policy Enforcement Point (PEP)**: before performing an action, it asks the PDP "Can user X perform action Y on resource Z given environment W?" The PDP — commonly Open Policy Agent (OPA) evaluating a Rego policy — returns `Allow` or `Deny`.

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

1. **Network Latency**: calling an external PDP on every request adds latency. Deploy the PDP (e.g. OPA) as a sidecar container in the same Kubernetes pod as the microservice, so the call stays on `localhost` instead of crossing a network hop.
2. **Data Filtering vs. Point Authorization**: a PDP answers "can Alice read document 123?" well. It's much less efficient at answering "list every document Alice can read" one row at a time. For listing endpoints, translate ABAC policies into database `WHERE` clauses instead — OPA's partial evaluation API can generate the equivalent SQL predicate from the same Rego rules, rather than evaluating the policy once per row.
3. **Fail-Closed by Design**: the PEP must always fail closed. If the PDP is unreachable, times out, or returns a malformed response, the microservice must reject the request — as `CheckAuthorization` does above by returning `false` on any error.
4. **Policy Testing**: because policy changes bypass a code review of the calling service, treat Rego changes with the same rigor as code — `opa test` against both allow and deny fixtures before deploying a new policy bundle.
