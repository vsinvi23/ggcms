# RBAC vs. ABAC vs. ReBAC: Reimagining Authorization with Google Zanzibar

## The Problem: The Graph Authorization Nightmare
Traditional access control models assume static hierarchies or flat attribute sets. 
- In **RBAC**, a user is given a role (e.g., `Viewer`), granting access to resources globally.
- In **ABAC**, dynamic variables are checked (e.g., `User.Department == Resource.Department`).

But consider modern cloud applications like Google Drive, Slack, or GitHub. Access is fundamentally relational and nested:
1. "User `Alice` can read `document:draft_plan` because she is a member of `group:security-team`."
2. "User `Bob` can edit `document:draft_plan` because it is inside `folder:q1-planning`, and Bob has `editor` access on `folder:q1-planning`."
3. "Organization admins have `owner` access on all repositories within the organization."

To check these conditions in RBAC or ABAC, you must execute deep SQL joins, fetch huge datasets, or load complex external attributes into memory during the request lifecycle. At scale, this crashes performance and database throughput. 

To solve this, we need **Relationship-Based Access Control (ReBAC)**, popularized by Google's Zanzibar paper.

---

## What is ReBAC?
ReBAC represents authorization as a **directed graph** where nodes are users and resources, and edges are relations.

Rather than checking if a user has a specific attribute, ReBAC asks: **"Is there a valid relationship path between the subject and the object?"**

```
[User: Alice] ---member_of---> [Group: SecTeam] ---viewer---> [Folder: Q1] ---contains---> [Doc: Draft]
```

### The Zanzibar Tuple Model
In Google Zanzibar, authorization assertions are stored as **Relation Tuples** (object-relation-user strings):

$$\text{object} \# \text{relation} @ \text{user}$$

Examples:
- `folder:q1_planning#viewer@group:security_team#member` (All members of security-team are viewers of the Q1 folder)
- `group:security_team#member@user:alice` (Alice is a member of the security team)
- `document:draft_plan#parent@folder:q1_planning` (Draft plan's parent is the Q1 folder)

---

## System Architecture: Zanzibar/ReBAC Authorization Engine

A ReBAC system isolates authorization into a high-performance, graph-database-backed microservice:

```
+------------------+             +--------------------------+
|   Client App     |             | Write Tuples (e.g., Git) |
+--------+---------+             +------------+-------------+
         |                                    | (Set relationships)
         | 1. Is 'alice' owner                v
         |    of 'doc:101'?      +------------+-------------+
+--------v---------+             |  Zanzibar Tuple Database |
| API Gateway/PEP  |------------>|   (CockroachDB/Spanner)  |
+--------+---------+   2. Query  +------------+-------------+
         ^                                    |
         | 4. Allowed: Yes/No                 | 3. Traverses Graph
         |                                    v
+--------+---------+             +--------------------------+
|  Client Response |             | Graph Engine (DFS/BFS)   |
+------------------+             +--------------------------+
```

---

## Technical Implementation: Mini Zanzibar Engine in Python

Here is a complete, runnable Python engine that models relation tuples, builds a directed graph of relationships, and executes a recursive graph-traversal check with cycle detection to resolve access.

```python
from typing import Dict, List, Set, Union, Optional

class Tuple:
    def __init__(self, namespace: str, object_id: str, relation: str, user_namespace: str, user_id: str, user_relation: Optional[str] = None):
        self.namespace = namespace              # e.g., "document"
        self.object_id = object_id              # e.g., "draft_plan"
        self.relation = relation                # e.g., "viewer"
        self.user_namespace = user_namespace    # e.g., "user" or "group"
        self.user_id = user_id                  # e.g., "alice" or "engineering"
        self.user_relation = user_relation      # e.g., "member" (if user represents a set)

    def __repr__(self) -> str:
        user_str = f"{self.user_namespace}:{self.user_id}"
        if self.user_relation:
            user_str += f"#{self.user_relation}"
        return f"{self.namespace}:{self.object_id}#{self.relation}@{user_str}"

class ZanzibarEngine:
    def __init__(self):
        # Maps "namespace:object_id#relation" -> list of usersets/users
        self.store: Dict[str, List[Tuple]] = {}

    def add_tuple(self, r_tuple: Tuple):
        key = f"{r_tuple.namespace}:{r_tuple.object_id}#{r_tuple.relation}"
        if key not in self.store:
            self.store[key] = []
        self.store[key].append(r_tuple)

    def check(self, target_object: str, relation: str, subject_user: str, visited: Optional[Set[str]] = None) -> bool:
        """
        Recursively checks if 'subject_user' (e.g., 'user:alice') has 'relation' (e.g., 'viewer')
        on 'target_object' (e.g., 'document:draft_plan'). Includes cycle detection.
        """
        if visited is None:
            visited = set()

        # Build a traversal path key for cycle detection
        visit_key = f"{target_object}#{relation}@{subject_user}"
        if visit_key in visited:
            return False  # Avoid infinite recursion cycles
        visited.add(visit_key)

        # 1. Direct evaluation: Check if subject is explicitly matched in the database
        lookup_key = f"{target_object}#{relation}"
        tuples = self.store.get(lookup_key, [])
        
        for t in tuples:
            # Case A: Explicit user match (e.g., document:draft#viewer@user:alice)
            if not t.user_relation and f"{t.user_namespace}:{t.user_id}" == subject_user:
                return True

            # Case B: Indirect userset match via nested relation (e.g., group membership)
            # t.user_namespace = "group", t.user_id = "security", t.user_relation = "member"
            if t.user_relation:
                nested_object = f"{t.user_namespace}:{t.user_id}"
                if self.check(nested_object, t.user_relation, subject_user, visited.copy()):
                    return True

        # 2. Indirect evaluation: Check hierarchical / parental inheritance
        # If document:draft has parent folder:q1, and folder:q1 has viewer alice, alice can view document:draft
        parent_lookup = f"{target_object}#parent"
        parent_tuples = self.store.get(parent_lookup, [])
        for pt in parent_tuples:
            parent_object = f"{pt.user_namespace}:{pt.user_id}"
            # Inherit relation from parent
            if self.check(parent_object, relation, subject_user, visited.copy()):
                return True

        return False

# --- Verification Simulation ---
if __name__ == "__main__":
    engine = ZanzibarEngine()

    # Define access relationships (tuples)
    # 1. Alice is a member of the security team
    engine.add_tuple(Tuple("group", "security_team", "member", "user", "alice"))
    
    # 2. The security team has 'viewer' rights to folder:q1_planning
    engine.add_tuple(Tuple("folder", "q1_planning", "viewer", "group", "security_team", "member"))
    
    # 3. document:draft_plan is inside folder:q1_planning
    engine.add_tuple(Tuple("document", "draft_plan", "parent", "folder", "q1_planning"))
    
    # 4. Bob is directly added as an editor of document:draft_plan
    engine.add_tuple(Tuple("document", "draft_plan", "editor", "user", "bob"))

    # Test cases
    print("Is Alice a viewer of document:draft_plan?")
    # Alice -> member of security_team -> viewer of folder:q1_planning -> parent of document:draft_plan
    print(engine.check("document:draft_plan", "viewer", "user:alice"))  # Expected: True

    print("\nIs Bob an editor of document:draft_plan?")
    print(engine.check("document:draft_plan", "editor", "user:bob"))  # Expected: True

    print("\nIs Bob a viewer of document:draft_plan? (Assuming editors inherit viewer rights - not automatically unless added, but let's test)")
    print(engine.check("document:draft_plan", "viewer", "user:bob"))  # Expected: False

    print("\nIs Eve a viewer of document:draft_plan?")
    print(engine.check("document:draft_plan", "viewer", "user:eve"))  # Expected: False
```

---

## Architectural Comparison Matrix

| Aspect | RBAC | ABAC | ReBAC (Zanzibar) |
| :--- | :--- | :--- | :--- |
| **Data Structure** | Flat / Set Membership | Document / JSON Policy | Directed Graph (Directed Acyclic Graph) |
| **Scale Constraint** | High roles count | Complexity of policy engine | Depth of graph traversal |
| **Storage Choice** | SQL, Key-Value | Redis, Cache | Distributed Spanner, CockroachDB |
| **Typical Use-case**| Internal Admin panels | Dynamic compliance gating | SaaS platforms, multi-tenant workspace permissions |

### Choosing Your Paradigm
- Use **RBAC** when your resources are static and coarse-grained.
- Use **ABAC** when access checks require dynamic/contextual information (time, IP, classification).
- Use **ReBAC** when you need fine-grained sharing, resource nested ownership, and Google-Drive-style collaborative models.
