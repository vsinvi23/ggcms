---
title: "Google Zanzibar vs. OPA: ReBAC at Global Scale"
description: "Why deeply nested, transitive permissions (Google Drive/Figma-style sharing) hit a scaling wall under RBAC/ABAC, how Google Zanzibar's Relationship-Based Access Control model solves it with relation tuples and graph traversal, and a working TypeScript ReBAC engine implementation."
categorySlug: "identity-access"
articleType: "DEEP_DIVE"
tags:
  - "zanzibar"
  - "rebac"
  - "open-policy-agent"
  - "authorization"
  - "spicedb"
  - "graph-database"
---

# Google Zanzibar vs. OPA: ReBAC at Global Scale

## The Problem: The Granular Authorization Scaling Wall

When scaling modern enterprise platforms, traditional access control models such as **Role-Based Access Control (RBAC)** and **Attribute-Based Access Control (ABAC)** hit a scaling wall. Consider a collaborative platform (like Google Drive or Figma) where an asset's access rule is defined dynamically: *"User X can write to Document Y because X is an administrator in Team Z, and Team Z has editor permissions on Folder A, which contains Document Y."*

Under RBAC, checking this requires pulling deep, nested relations from databases, leading to complex SQL joins that degrade API performance. To decouple this, many teams adopt **Open Policy Agent (OPA)**. OPA compiles authorization rules into declarative **Rego** policies. This is excellent for microservice-level decisions (e.g., "Can this service execute a POST request on `/payments`?"). However, OPA is not designed to store, index, and query billions of fine-grained entity relationships with sub-millisecond latency.

For large-scale, deeply-nested relational authorization, architectures are moving to **Relationship-Based Access Control (ReBAC)**, inspired by **Google Zanzibar** — the paper Google published in 2019 describing the authorization system behind Drive, Calendar, and Photos, which evaluates on the order of trillions of access-control tuples.

## Architectural Comparison: Zanzibar (ReBAC) vs. OPA (ABAC/PBAC)

Zanzibar and OPA solve fundamentally different authorization problems. Zanzibar is a highly-optimized global graph database storing simple relations. OPA is a Turing-complete logic engine executing policy files.

```
[ Google Zanzibar: ReBAC Graph Evaluation ]
Tuple Store: (document:101#viewer@user:99) ---> [Recursive Graph Walk] ---> Check: Access Allowed?
                                                      | (Uses index caches)

[ Open Policy Agent (OPA): PBAC Rule Evaluation ]
Rego Policy File + Input JSON Metadata ----------> [OPA Policy Engine]   ---> Check: Access Allowed?
                                                      | (In-memory evaluation)
```

| Dimension | Google Zanzibar (ReBAC) | Open Policy Agent (OPA) |
| :--- | :--- | :--- |
| **Primary Goal** | Sub-millisecond evaluation of deep relationship graphs. | Decoupling complex business logic and policy rules. |
| **Core Concept** | Relation Tuples (`object#relation@user`). | Declarative Policy (Rego language) + Data Document. |
| **Scale Target** | Trillions of tuples, millions of authorization checks/sec. | Distributed microservice gateways, Kubernetes admission. |
| **Consistency** | Strict snapshot consistency via "Zookies" (token-based). | Eventual consistency depending on data replication. |

## Technical Implementation: A Recursive ReBAC Engine

Below is a robust TypeScript implementation of a localized Zanzibar-style recursive relation resolver. It models namespaced objects, usersets, and computes access by recursively evaluating the relationship graph, with built-in loop detection.

```typescript
interface RelationTuple {
  namespace: string;
  object: string;
  relation: string;
  user: string; // Can be a raw userId, or a userset: "namespace:object#relation"
}

export class ZanzibarEngine {
  private tupleStore: RelationTuple[] = [];

  constructor(initialTuples: RelationTuple[] = []) {
    this.tupleStore = initialTuples;
  }

  /**
   * Add a relationship tuple dynamically (analogous to Zanzibar Write API)
   */
  public addTuple(tuple: RelationTuple): void {
    this.tupleStore.push(tuple);
  }

  /**
   * Main Check API: Resolves if a subject has a specific relation on an object
   */
  public async check(
    namespace: string,
    object: string,
    relation: string,
    subject: string,
    visited: Set<string> = new Set()
  ): Promise<boolean> {
    // 1. Loop detection to prevent infinite recursion in cyclic graphs
    const detectionKey = `${namespace}:${object}#${relation}@${subject}`;
    if (visited.has(detectionKey)) {
      return false;
    }
    visited.add(detectionKey);

    // 2. Direct Check: Look for a tuple matching (object#relation@subject) directly
    const directMatch = this.tupleStore.some(
      (t) =>
        t.namespace === namespace &&
        t.object === object &&
        t.relation === relation &&
        t.user === subject
    );
    if (directMatch) {
      return true;
    }

    // 3. Userset Indirection Check: Resolve nested relations (e.g. groups or folders)
    // Find tuples for this object and relation that point to a "userset" rather than a raw user ID
    const potentialUsersetTuples = this.tupleStore.filter(
      (t) =>
        t.namespace === namespace &&
        t.object === object &&
        t.relation === relation &&
        t.user.includes('#')
    );

    for (const tuple of potentialUsersetTuples) {
      // Deconstruct userset definition: "group:marketing#member"
      const [usersetNamespaceObject, usersetRelation] = tuple.user.split('#');
      const [usersetNamespace, usersetObject] = usersetNamespaceObject.split(':');

      // Recursively evaluate if the target subject belongs to the nested userset
      const isMemberOfUserset = await this.check(
        usersetNamespace,
        usersetObject,
        usersetRelation,
        subject,
        new Set(visited) // Pass cloned visited set to isolate concurrent paths
      );

      if (isMemberOfUserset) {
        return true;
      }
    }

    // 4. Inherited/Transitive Relation Check: Check if a parent relation implies this relation
    // (e.g., "editor" on a folder implies "viewer" on its child documents)
    const containerTuples = this.tupleStore.filter(
      (t) => t.namespace === namespace && t.object === object && t.relation === 'parent'
    );

    for (const parentTuple of containerTuples) {
      const [parentNamespace, parentObject] = parentTuple.user.split(':');

      // Check if the subject possesses the required relationship on the parent container
      const hasRelationOnParent = await this.check(
        parentNamespace,
        parentObject,
        relation, // Check same relation on the parent
        subject,
        new Set(visited)
      );

      if (hasRelationOnParent) {
        return true;
      }
    }

    return false;
  }
}
```

### Using the Engine

```typescript
const engine = new ZanzibarEngine([
  { namespace: 'folder', object: 'A', relation: 'viewer', user: 'user:alice' },
  { namespace: 'folder', object: 'B', relation: 'parent', user: 'folder:A' },
  { namespace: 'doc', object: 'C', relation: 'parent', user: 'folder:B' },
]);

// Does Alice have "viewer" on doc:C, transitively through folder:B -> folder:A?
const canView = await engine.check('doc', 'C', 'viewer', 'user:alice');
console.log(canView); // true, via the parent-chain traversal
```

Real Zanzibar-derived systems (Authzed/SpiceDB, Ory Keto, Topaz) define this traversal declaratively in a schema rather than as procedural graph-walking code:

```text
definition folder {
    relation viewer: user
    relation parent: folder

    // A viewer of a folder is a direct viewer,
    // OR a viewer of the parent folder
    permission view = viewer + parent->view
}

definition doc {
    relation parent: folder

    // To view a doc, you must have view permission on the parent folder
    permission view = parent->view
}
```

## Defensive Hardening Checklist

1. **Implement Loop Limits**: When resolving relationships recursively, always enforce a maximum stack depth limit (e.g., depth limit of 10) alongside loop detection to prevent stack overflows under malicious cyclic graphs.
2. **Handle the "New Enemy" Problem**: Ensure your ReBAC implementation uses a consistent snapshot transaction token (Zanzibar's "Zookies") to prevent authorization checks from evaluating outdated relationship states when permissions are revoked. Without this, a revoked permission can still appear valid to a check that reads a stale replica.
3. **Optimistic Caching**: Cache path evaluations using an in-memory graph index. Since authorization graphs change frequently, cache entries must be invalidated immediately upon tuple-write events.
4. **Decouple Policy from Graph**: Use Zanzibar (or a SpiceDB-style engine) for the *identity relationships* (e.g. who owns what) and use OPA for the static *policy constraints* (e.g. can requests be processed during out-of-office hours, IP range controls). Trying to force one engine to do both jobs usually means fighting the tool.

## Choosing Your Architecture

- **Choose OPA when:** authorization relies heavily on request context (IP address, time of day), resource attributes (department, classification), and you can easily pass the required data payload to the OPA sidecar.
- **Choose Zanzibar-style ReBAC when:** authorization relies on deeply nested hierarchies, ownership chains, user groups, and transitive relationships, especially when scaling to millions of entities where graph traversal latency must remain under 10 milliseconds globally.
