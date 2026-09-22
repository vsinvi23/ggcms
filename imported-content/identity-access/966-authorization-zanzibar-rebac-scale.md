# Google Zanzibar vs OPA: Relationship-Based Access Control (ReBAC) at Global Scale

## The Problem
As SaaS applications grow, Role-Based Access Control (RBAC) quickly breaks down. Granular permissions ("Alice can edit Document A because she is in Group B which is a member of Folder C") require traversing deep organizational hierarchies. Attribute-Based Access Control (ABAC) using Open Policy Agent (OPA) works well for local logic but struggles when policies depend on millions of deeply nested, globally distributed relationships. To solve this, Google developed Zanzibar, a system for Relationship-Based Access Control (ReBAC).

## RBAC vs ABAC vs ReBAC
- **RBAC**: `User -> Role -> Permission` (Too rigid for nested hierarchies).
- **ABAC (OPA)**: `If User.dept == Resource.dept -> Allow` (Decentralized, policy-as-code, but requires data to be local to the evaluation engine).
- **ReBAC (Zanzibar)**: Graphs relationships. `User X has relation R to Object Y`. Evaluates paths through a massive directed graph.

## Google Zanzibar Architecture
Zanzibar (the inspiration for OSS systems like SpiceDB, Auth0 FGA, and Ory Keto) centralizes relationship data into a globally consistent, scalable database (Spanner).

```text
+----------------+        +--------------------------+
| Microservice   | Check()| Zanzibar Engine          |
| (API Gateway)  |=======>| (SpiceDB / Auth0 FGA)    |
+----------------+        +--------------------------+
                                |               ^
                                v               |
                        +-------------------------------+
                        |   Relationship Graph          |
                        |   (Alice -> Member -> GroupB) |
                        |   (GroupB -> Editor -> Doc1)  |
                        +-------------------------------+
```

## The Zanzibar Data Model: Tuples
Authorization state is stored as millions of "relation tuples" in the format:
`object#relation @ user`

Example tuples:
```text
folder:engineering#viewer @ user:alice
document:q3-roadmap#parent @ folder:engineering
document:q3-roadmap#editor @ user:bob
```

## Schema Definitions
The engine uses a schema to understand how relationships inherit.

```zanzibar
// Example SpiceDB Schema
definition user {}

definition folder {
    relation viewer: user
}

definition document {
    relation parent: folder
    relation editor: user
    
    // A user is a viewer if they are an editor, OR if they have viewer access 
    // to the parent folder. This is graph traversal logic.
    permission view = editor + parent->viewer
}
```

## OPA vs Zanzibar: When to choose which?

### Open Policy Agent (ABAC)
**Best for**: Infrastructure authorization (Kubernetes admission control, Envoy API routing based on JWT claims).
**Pros**: Highly decentralized. Engine runs as a sidecar. Policies are code (Rego). Ultra-low latency since data is in memory.
**Cons**: If the policy requires joining millions of rows (e.g., "Is user part of a 10-deep nested group that owns this file?"), OPA struggles because it requires shipping all that graph data to the sidecar.

### Zanzibar / SpiceDB (ReBAC)
**Best for**: Application-level authorization with complex, nested hierarchies (Google Docs, GitHub, Notion).
**Pros**: Solves the "nested graph" problem natively. Globally consistent. Handles millions of edges.
**Cons**: Requires standing up a dedicated authorization cluster. Centralized architecture introduces a network hop for every `Check()` request.

## Implementation: Performing a Check (SpiceDB / Go)
Instead of executing complex SQL joins, your application simply asks the Zanzibar engine a binary question.

```go
package authz

import (
	"context"
	authzed "github.com/authzed/authzed-go/v1"
	pb "github.com/authzed/authzed-go/proto/authzed/api/v1"
)

func CheckAccess(client *authzed.Client, userID, documentID string) (bool, error) {
	resp, err := client.PermissionsService.CheckPermission(context.Background(), &pb.CheckPermissionRequest{
		Resource: &pb.ObjectReference{
			ObjectType: "document",
			ObjectId:   documentID,
		},
		Permission: "view",
		Subject: &pb.SubjectReference{
			Object: &pb.ObjectReference{
				ObjectType: "user",
				ObjectId:   userID,
			},
		},
	})
	
	if err != nil {
		return false, err
	}
	
	return resp.Permissionship == pb.CheckPermissionResponse_PERMISSIONSHIP_HAS_PERMISSION, nil
}
```

By offloading the graph traversal to Zanzibar, microservices remain stateless and decoupled from the complex relational rules of the organization.
