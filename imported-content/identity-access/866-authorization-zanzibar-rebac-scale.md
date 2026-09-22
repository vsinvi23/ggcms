# Google Zanzibar vs OPA: Relationship-Based Access Control (ReBAC) at Global Scale

## The Problem: Enforcing Fine-Grained Authorization at Scale

As enterprise applications grow, standard Role-Based Access Control (RBAC) models fail to handle complex ownership and hierarchical data structures. For example, "Allow user U to edit folder F if U is an editor of team T, which owns project P, which contains folder F." Evaluating these deep relationship graphs dynamically across millions of objects and users creates significant latency and architectural complexity.

Two prominent paradigms have emerged to address modern access control:
1. **Open Policy Agent (OPA):** A centralized policy engine utilizing Attribute-Based and Policy-Based Access Control (ABAC/PBAC) written in Rego.
2. **Google Zanzibar:** A distributed, relationship-graph-based authorization engine (ReBAC) storing authorization facts as direct relation tuples.

Using OPA for deep relationship graphs requires loading massive relationship graphs directly into memory or querying databases on every policy evaluation. Conversely, applying Zanzibar to systems that require complex spatial or temporal attributes (e.g., "Allow access only if IP is in range X and time is between 9 AM and 5 PM") is functionally restrictive.

---

## Technical Architecture

The following diagram contrasts OPA's policy-as-code evaluation against Google Zanzibar's graph traversal engine:

```
+---------------------------------------------------------------------------------+
|                               Policy Evaluation                                 |
+---------------------------------------------------------------------------------+

  [ Open Policy Agent (OPA) ]
  Evaluates decoupled policies dynamically over input JSON structures.
  
  +------------------+         Input JSON (context)
  |   API Request    | --------------------+
  +------------------+                     v
                                  +------------------+
                                  |    Rego Engine   | ---> [ Allow / Deny ]
                                  +------------------+
                                           ^
                                           | Loaded Policy-as-Code
                                  +------------------+
                                  |   Policy File    |
                                  +------------------+

  -----------------------------------------------------------------------------

  [ Google Zanzibar Model ]
  Traverses flat relationship tuples to evaluate deep graphs recursively.
  
  +-------------------------------------------------------------------------+
  | Tuple Store (Fact Base):                                                |
  |  - document:doc_abc#owner@user_xyz                                      |
  |  - folder:folder_123#parent@document:doc_abc                            |
  |  - folder:folder_123#viewer@group_marketing#member                      |
  +-------------------------------------------------------------------------+
                                      |
                                      v
                             +------------------+
  Check(user, relation, obj) | Graph Traversal  | ---> [ True / False ]
  =========================> |   Query Engine   |
                             +------------------+
```

---

## Key Comparison Metrics

| Feature | Google Zanzibar (ReBAC) | Open Policy Agent (OPA) |
| :--- | :--- | :--- |
| **Model** | Relationship-Based Access Control (ReBAC) | Attribute/Policy-Based Access Control (ABAC) |
| **Data Locality** | Centralized, highly scalable global tuple graph | Distributed sidecar caches or memory-loaded JSON |
| **Consistency** | Strict snapshot consistency via token-based Zookies | Eventual consistency depending on input/state latency |
| **Strengths** | Recursive relationship graphs (groups, folders, shares) | Contextual environmental rules (IP, time, attributes) |

---

## Code Implementation: Go (Zanzibar Tuple Evaluation)

The following Go implementation demonstrates a simplified, recursive relationship checker that evaluates Google Zanzibar-style tuples (`namespace:object#relation@user`) to solve complex ReBAC graph checks.

```go
package main

import (
	"fmt"
	"strings"
)

// RelationshipTuple represents a Zanzibar tuple: object#relation@user
type RelationshipTuple struct {
	Namespace string
	ObjectID  string
	Relation  string
	User      string // Can be a user ID or another object relation (e.g., group:marketing#member)
}

type ZanzibarEngine struct {
	tuples []RelationshipTuple
}

func NewZanzibarEngine() *ZanzibarEngine {
	return &ZanzibarEngine{
		tuples: make([]RelationshipTuple, 0),
	}
}

func (e *ZanzibarEngine) AddTuple(namespace, objectID, relation, user string) {
	e.tuples = append(e.tuples, RelationshipTuple{
		Namespace: namespace,
		ObjectID:  objectID,
		Relation:  relation,
		User:      user,
	})
}

/**
 * Checks if a user has a specific relation to an object, traversing nested groups recursively.
 */
func (e *ZanzibarEngine) Check(user string, relation string, namespace string, objectID string, depth int) bool {
	// Prevent infinite recursion in cyclical relationship graphs
	if depth > 10 {
		return false
	}

	for _, tuple := range e.tuples {
		if tuple.Namespace == namespace && tuple.ObjectID == objectID && tuple.Relation == relation {
			// Direct assignment check (e.g., document:doc1#viewer@user123)
			if tuple.User == user {
				return true
			}

			// Recursive expansion check for group memberships (e.g., document:doc1#viewer@group:marketing#member)
			if strings.Contains(tuple.User, "#") {
				parts := strings.Split(tuple.User, "#") // [group:marketing, member]
				subRelation := parts[1]
				
				objectParts := strings.Split(parts[0], ":") // [group, marketing]
				subNamespace := objectParts[0]
				subObjectID := objectParts[1]

				// Evaluate if the user belongs to the nested group relationship
				if e.Check(user, subRelation, subNamespace, subObjectID, depth+1) {
					return true
				}
			}
		}
	}

	return false
}

func main() {
	engine := NewZanzibarEngine()

	// Establish relationship facts
	// user_admin is an owner of document:doc_secret
	engine.AddTuple("document", "doc_secret", "owner", "user_admin")
	// group:marketing#member are viewers of document:doc_secret
	engine.AddTuple("document", "doc_secret", "viewer", "group:marketing#member")
	// user_marketer is a member of group:marketing
	engine.AddTuple("group", "marketing", "member", "user_marketer")

	// 1. Direct validation check
	isAdminOwner := engine.Check("user_admin", "owner", "document", "doc_secret", 0)
	fmt.Printf("Is admin owner: %v\n", isAdminOwner) // Output: true

	// 2. Recursive group evaluation check
	isMarketerViewer := engine.Check("user_marketer", "viewer", "document", "doc_secret", 0)
	fmt.Printf("Is marketer viewer (via group): %v\n", isMarketerViewer) // Output: true
}
```

---

## Operational Verification

To verify your authorization engine architecture:
- For group-based systems: construct dynamic organizational structures (nested teams of folders and documents); verify that Zanzibar-style engines resolve deep permissions in single-digit milliseconds.
- For attribute-based environments: verify that OPA sidecars execute fine-grained, policy-as-code evaluations rapidly, keeping heavy data queries isolated to specialized cache engines.
