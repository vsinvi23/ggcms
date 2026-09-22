# Google Zanzibar vs OPA: Relationship-Based Access Control (ReBAC) at Global Scale

## The Problem: The Limits of RBAC and ABAC in Microservices

As applications scale from monoliths to globally distributed microservices, authorization becomes a bottleneck. 

Traditionally, systems rely on **Role-Based Access Control (RBAC)** (e.g., "Admins can delete documents") or **Attribute-Based Access Control (ABAC)** (e.g., "Users can edit documents if `user.department == doc.department`"). 

However, modern collaboration platforms (like Google Drive or Notion) require hyper-granular, deeply nested permissions: 
*   *Alice* can view *Folder A*.
*   *Folder B* is inside *Folder A*.
*   *Document C* is inside *Folder B*.
*   Can *Alice* view *Document C*?

Computing these transitive permissions on the fly within a stateless microservice is computationally expensive. If every microservice maintains its own local database of permissions, the system suffers from consistency issues and massive latency during complex queries. 

## The Mental Model: Policy Engines vs. Graph Databases

To solve this, the industry has diverged into two dominant architectural patterns: **Policy-as-Code** (epitomized by Open Policy Agent - OPA) and **Relationship-Based Access Control (ReBAC)** (epitomized by Google Zanzibar).

*   **OPA (The Judge):** OPA is a stateless judge. You hand OPA a set of rules (written in Rego) and the current state of the world (JSON data). OPA evaluates the rules and replies "Allow" or "Deny." OPA is brilliant, but it requires *you* to bring all the necessary data to the courtroom for every decision.
*   **Zanzibar (The Cartographer):** Zanzibar is a massive, globally replicated map of relationships. It doesn't evaluate abstract logic; it traverses a graph. You ask Zanzibar, "Is there a path from Alice to Document C via a 'viewer' edge?" Zanzibar rapidly walks the graph and replies.

```mermaid
graph TD
    subgraph OPA Architecture (ABAC/RBAC)
        A[Microservice] -->|1. Fetch data from DB| B[(Database)]
        B -->|2. Return doc metadata| A
        A -->|3. Ask OPA: Input Data + Rules| C{OPA (Rego)}
        C -->|4. Allow/Deny| A
    end

    subgraph Zanzibar Architecture (ReBAC)
        D[Microservice] -->|1. Ask Zanzibar: Can Alice view Doc C?| E{Zanzibar API}
        E -->|2. Traverse global graph| F[(Spanner / Graph DB)]
        F -->|3. Path exists!| E
        E -->|4. Allow/Deny| D
    end
```

## Open Policy Agent (OPA) Deep Dive

OPA decouples policy from application code. Policies are written in a declarative language called Rego.

### The Rego Policy (ABAC)

```rego
package document.authz

default allow = false

# Allow if user is the owner
allow {
    input.user.id == input.document.owner_id
}

# Allow if user is in the same department and doc is internal
allow {
    input.user.department == input.document.department
    input.document.classification == "internal"
}
```

**The OPA Challenge:** OPA executes this instantly, but the microservice calling OPA must first query its own database to construct the `input.document` JSON. If the authorization decision depends on deeply nested folder structures, fetching that context before calling OPA becomes a massive N+1 query problem.

## Google Zanzibar Deep Dive

Zanzibar (and open-source derivatives like Authzed/SpiceDB, Ory Keto, and Topaz) flips the model. Instead of storing attributes, it stores **Tuples** (edges in a graph).

### The Zanzibar Tuples (ReBAC)

A tuple looks like this: `object#relation@user`

1.  `folder:A#viewer@user:alice` (Alice is a viewer of Folder A)
2.  `folder:B#parent@folder:A` (Folder A is the parent of Folder B)
3.  `doc:C#parent@folder:B` (Folder B is the parent of Doc C)

### The Namespace Configuration

You define the rules of traversal in a schema:

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

### The Zanzibar Execution

When the microservice asks Zanzibar, `Check(doc:C, view, user:alice)`, Zanzibar performs a highly optimized, parallelized graph traversal:
1.  Check `doc:C`. Needs `parent->view`. Parent is `folder:B`.
2.  Check `folder:B`. Needs `viewer` OR `parent->view`. Parent is `folder:A`.
3.  Check `folder:A`. Needs `viewer`. Finds `folder:A#viewer@user:alice`.
4.  Returns **ALLOW**.

Zanzibar solves the N+1 problem by pre-calculating and caching these graph intersections globally (using Google Spanner in the original paper). 

## Choosing Your Architecture

*   **Choose OPA when:** Authorization relies heavily on request context (IP address, time of day), resource attributes (department, classification), and you can easily pass the required data payload to the OPA sidecar.
*   **Choose Zanzibar when:** Authorization relies on deeply nested hierarchies, ownership chains, user groups, and transitive relationships, especially when scaling to millions of entities where graph traversal latency must remain under 10 milliseconds globally.