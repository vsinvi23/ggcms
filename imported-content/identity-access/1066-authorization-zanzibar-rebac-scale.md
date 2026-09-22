# Google Zanzibar vs OPA: Relationship-Based Access Control (ReBAC) at Global Scale

In modern cloud applications, authorization logic has evolved beyond simple Role-Based Access Control (RBAC). For highly collaborative enterprise platforms, permissions depend on deep, nested relationships between users, groups, and resources (e.g., "User A can view Report B because they are a member of Group C, which is granted editor rights on Folder D containing Report B"). 

To handle this complexity at scale, two dominant authorization paradigms have emerged: **Open Policy Agent (OPA)** and **Google Zanzibar**.

---

## The Problem: The Fine-Grained Authorization Paradox

When designing authorization for microservices, architects encounter the "data-shipping paradox":

1. **The OPA (Policy-as-Code) Dilemma:** OPA uses a declarative language (Rego) to evaluate Attribute-Based Access Control (ABAC) policies. To make a decision, OPA needs both the policy logic and the contextual data. If a policy requires checking complex nested group hierarchies, that group structure data must either be synchronized to every local OPA sidecar (unsustainable data shipping) or fetched dynamically during evaluation (introducing latency bottlenecks).
2. **The Zanzibar (Graph-Based) Paradigm:** Google Zanzibar models authorization strictly as a directed graph of relationships (Relation Tuples). It is built for trillions of objects and global scale, resolving nested memberships via graph traversal. However, modeling complex business rules, dynamic attribute checks (e.g., IP white-lists or time-of-day access), or infrastructure security via Zanzibar is highly complex because it lacks a generic procedural logic engine.

---

## Technical Architecture: Zanzibar Graph vs. OPA sidecar

Zanzibar decouples authorization by storing relationship tuples in a highly optimized, distributed graph database. OPA, conversely, evaluates localized policies using loaded JSON attributes.

```
[OPA - Policy as Code / Sidecar]
+-------------+     Local Query     +-------------------+
| Microservice| ------------------->| OPA Sidecar       | <--- Evaluates static Rego logic
|             | <-------------------| (In-Memory Engine)|      over attributes
+-------------+     Allow/Deny      +-------------------+

[Google Zanzibar - Relationship Graph]
+-------------+     Check Query     +-------------------+     Recursive Query     +-------------------+
| Microservice| ------------------->| Zanzibar Engine   | ----------------------> | Spanner DB        |
|             | <-------------------| (Graph Traverser) | <---------------------- | (Relation Tuples) |
+-------------+     Allow/Deny      +-------------------+   Resolve nested groups +-------------------+
```

---

## Production-Grade Code: Zanzibar Relationship Check Engine

Below is a robust TypeScript implementation representing a Zanzibar-inspired core ReBAC engine. It defines relation tuples (`object#relation@user`) and implements high-performance recursive graph checks complete with cycle-detection to prevent infinite loops.

```typescript
// Define a Zanzibar Relation Tuple schema
// Format: namespace:object_id#relation@user_id OR namespace:object_id#relation@namespace:object_id#relation
interface RelationTuple {
  namespace: string;
  object: string;
  relation: string;
  user: string; // Can be a literal userId ("user:123") or a nested userset ("group:engineering#member")
}

export class ZanzibarEngine {
  private tupleStore: RelationTuple[] = [];

  constructor(initialTuples: RelationTuple[] = []) {
    this.tupleStore = initialTuples;
  }

  /**
   * Evaluates if a user has a specific relation to an object.
   * Leverages recursive graph traversal with strict cycle protection.
   */
  public async check(
    namespace: string,
    object: string,
    relation: string,
    user: string,
    visited: Set<string> = new Set()
  ): Promise<boolean> {
    const evaluationKey = `${namespace}:${object}#${relation}@${user}`;
    
    // Cycle detection: If we have visited this exact node path before, abort to prevent stack overflow
    if (visited.has(evaluationKey)) {
      return false;
    }
    visited.add(evaluationKey);

    // 1. Direct Match: Check if the user is explicitly bound to the object via the relation
    const directMatch = this.tupleStore.some(
      (t) =>
        t.namespace === namespace &&
        t.object === object &&
        t.relation === relation &&
        t.user === user
    );
    if (directMatch) return true;

    // 2. Indirection / Userset Match: Find all tuples matching the namespace, object, and relation
    const candidateTuples = this.tupleStore.filter(
      (t) => t.namespace === namespace && t.object === object && t.relation === relation
    );

    for (const tuple of candidateTuples) {
      // Check if the tuple references a nested userset (e.g., group:engineering#member)
      if (tuple.user.includes('#')) {
        const [nestedTarget, nestedRelation] = tuple.user.split('#');
        const [nestedNamespace, nestedObject] = nestedTarget.split(':');

        // Recursively evaluate if the user is a member of the nested group
        const isMemberOfNestedGroup = await this.check(
          nestedNamespace,
          nestedObject,
          nestedRelation,
          user,
          new Set(visited) // Clone visited set to maintain branch path isolation
        );

        if (isMemberOfNestedGroup) {
          return true;
        }
      }
    }

    return false;
  }
}

// ==========================================
// Operational Usage Example
// ==========================================
const systemTuples: RelationTuple[] = [
  // 1. "user:vivek" is a member of "group:security-team"
  { namespace: 'group', object: 'security-team', relation: 'member', user: 'user:vivek' },
  
  // 2. Members of "group:security-team" are granted "viewer" rights on "folder:confidential-documents"
  { namespace: 'folder', object: 'confidential-documents', relation: 'viewer', user: 'group:security-team#member' },
  
  // 3. "document:q4-report" is parented by "folder:confidential-documents"
  { namespace: 'document', object: 'q4-report', relation: 'viewer', user: 'folder:confidential-documents#viewer' },
];

const engine = new ZanzibarEngine(systemTuples);

// Query: Can "user:vivek" view "document:q4-report"?
// The engine recursively checks:
//   document:q4-report#viewer -> folder:confidential-documents#viewer -> group:security-team#member -> user:vivek
engine.check('document', 'q4-report', 'viewer', 'user:vivek')
  .then(hasAccess => console.log(`Access check result: ${hasAccess}`)); // Returns true
```

---

## Architectural Comparison Matrix

| Feature | Open Policy Agent (OPA) | Google Zanzibar (ReBAC) |
| :--- | :--- | :--- |
| **Primary Use Case** | Infrastructure, API Gateways, dynamic ABAC | Collaborative tools, deep hierarchical permissions |
| **Model** | Policy-as-Code (Procedural/Declarative) | Relationship Graph (Relation Tuples) |
| **Data Requirements** | Shipped JSON payload | Dedicated scale-out Graph Store |
| **Latency Profile** | High in-memory speed, but bottlenecks on data load | Extremely fast recursive checks (<10ms) via distributed cache |
| **Consistency** | Eventual consistency of distributed policy files | Strict serializability via consistency tokens ("Zookies") |

## Summary: When to Choose Which?

- **Choose OPA** if your authorization decisions depend heavily on complex, dynamic policies (e.g., checking if the user’s request originated from a specific subnet, during business hours, and matches specific value brackets like transaction limits).
- **Choose Zanzibar** if your core challenge is model complexity and scale (e.g., managing a highly nested folder hierarchy with inheritance across millions of documents shared among thousands of overlapping user groups).
