---
title: "Attribute-Based Access Control (ABAC): Writing OPA Rego Policies"
description: "A practical guide to replacing RBAC role explosion with attribute-based authorization using Open Policy Agent and Rego, including a hardened policy example and common pitfalls."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "abac"
  - "open-policy-agent"
  - "rego"
  - "authorization"
  - "rbac"
  - "policy-as-code"
---

# Attribute-Based Access Control (ABAC): Writing OPA Rego Policies

## The Problem: Role Explosion and the Static Limits of RBAC

In large enterprise systems, Role-Based Access Control (RBAC) scales poorly. Under a pure RBAC model, access is determined strictly by predefined user groups (e.g., `Admin`, `Manager`, `Employee`). As business requirements grow, engineers face the "role explosion" problem, forced to create hundreds of hyper-specific roles (such as `USDocsBillingReader`, `EUDocsBillingWriter`) to handle fine-grained permissions.

Furthermore, RBAC cannot evaluate dynamic, context-specific variables, such as: "Can a user access this financial record outside of standard working hours?" or "Is the user accessing the API from a secure corporate network IP?" Storing this logical complexity in application code is an architectural anti-pattern, scattering security rules across dozens of services. To enforce granular, dynamic, and audit-compliant access controls, organizations must decouple authorization logic from application code, transitioning to Attribute-Based Access Control (ABAC).

## The Mental Model: Dynamic Authorization with OPA

ABAC evaluates permissions at runtime by feeding four categories of attributes into a policy engine:

1. **Subject (User):** Department, clearance level, manager status, authentication strength.
2. **Resource:** Owner, security classification, region, department.
3. **Action:** Read, write, delete, approve.
4. **Environment:** Network IP, time of day, system threat level.

Open Policy Agent (OPA) serves as the Policy Decision Point (PDP). The application microservice acts as the Policy Enforcement Point (PEP). It queries OPA with an `input` JSON containing these attributes, and OPA evaluates them against rules written in **Rego**, its declarative policy language, returning a simple boolean decision or custom JSON metadata.

```
+-------------+                       +-------------------+
|             |--- 1. Send Request -->|  API Gateway /    |
|   Client    |                       |   Microservice    |
|             |<-- 4. Access Denied --|      (PEP)        |
+-------------+                       +-------------------+
                                             |     ^
                                  2. Query   |     | 3. Response:
                                  with JSON  |     |   { "allow": true }
                                             v     |
                                      +-------------------+
                                      | Open Policy Agent |
                                      |      (PDP)        |
                                      +-------------------+
```

By decoupling these decisions, security rules can be updated, version-controlled (GitOps), and tested independently of the core service code.

## Implementing ABAC in Rego

Below is an enterprise-grade OPA Rego policy regulating file access based on subject, resource, action, and environment attributes.

### Policy Code (`policy.rego`)

```rego
package authz

# Default deny-all (Zero-Trust)
default allow = false

# Allow access if any of the rule blocks evaluate to true
allow {
    is_authorized_employee
    is_secure_network
    not is_restricted_time
}

# Rule 1: Check user-to-resource attribute alignment
is_authorized_employee {
    input.action == "read"
    input.subject.department == input.resource.department
    input.subject.clearance_level >= input.resource.required_clearance
}

# Rule 2: Owners always have write access
is_authorized_employee {
    input.action == "write"
    input.subject.id == input.resource.owner_id
    input.subject.mfa_enabled == true
}

# Rule 3: Enforce strict IP range check
is_secure_network {
    net.cidr_contains("10.100.0.0/16", input.environment.client_ip)
}

# Rule 4: Block access during high-risk hours
is_restricted_time {
    day := time.weekday(input.environment.request_epoch_ns)
    day == "Saturday"
}

is_restricted_time {
    day := time.weekday(input.environment.request_epoch_ns)
    day == "Sunday"
}
```

### JSON Input Payload (`input.json`)

The application queries OPA by passing the following JSON context:

```json
{
  "subject": {
    "id": "usr_9876",
    "department": "Engineering",
    "clearance_level": 3,
    "mfa_enabled": true
  },
  "resource": {
    "id": "doc_4321",
    "department": "Engineering",
    "required_clearance": 2,
    "owner_id": "usr_9876"
  },
  "action": "write",
  "environment": {
    "client_ip": "10.100.45.12",
    "request_epoch_ns": 1715011200000000000
  }
}
```

### Querying OPA from an Application

In production, the PEP calls OPA's REST API rather than embedding Rego evaluation in-process:

```bash
curl -X POST http://localhost:8181/v1/data/authz/allow \
  -H "Content-Type: application/json" \
  -d @input.json
```

A typical response looks like:

```json
{ "result": true }
```

## Security Hardening and Common Pitfalls

1. **Default-Allow Flaw:** Forgetting to declare `default allow = false` at the top of a Rego policy. Without this, missing matching conditions can result in open access. Every Rego authorization package should start with an explicit deny-by-default line — treat its absence as a blocking finding in any policy review.
2. **Input Context Poisoning:** If the client application supplies the input JSON attributes directly, an attacker can modify their department or IP variables.
   - *Defense:* The PEP must resolve attributes on the server side (e.g., extracting claims from a validated token, retrieving IP addresses from the network socket, and fetching resource metadata from a secure database) before querying OPA. Never let a client-supplied field become `input.subject.*` verbatim.
3. **Silent Rule Fallthrough:** Rego evaluates multiple `allow` blocks as a logical OR. It is easy to add a new "convenience" rule block that unintentionally widens access far beyond what a policy review expected. Keep rule blocks small, named, and covered by unit tests (`opa test`) that assert both allowed and denied cases.
4. **Untested Environment Attributes:** Rules like the weekday check above are easy to get wrong across time zones. Always test with `opa eval` using representative `request_epoch_ns` values from every deployment region, not just UTC.

By migrating to OPA and implementing structured Rego rules, developers can completely eliminate RBAC role explosion, creating highly resilient, dynamic authorization planes for modern microservices.
