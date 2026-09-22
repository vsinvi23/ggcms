# Open Policy Agent (OPA): Rego Policies for API Data Filtering and Partial Evaluation

## The Problem
Most authorization systems make binary decisions: a user is either authorized (YES) or unauthorized (NO) to perform an action on a resource. However, in enterprise SaaS and multi-tenant applications, access control is rarely binary. Users must be allowed to view lists of resources, but *only* the specific items they own, or those belonging to their corporate department. 

If an application handles this by querying an authorization engine (like Open Policy Agent) for each individual item in a list of thousands, it runs into the notorious "N+1 query problem," causing massive network overhead and latency. Conversely, if the application pulls all database records into memory to filter them on the application layer, it risks severe memory exhaustion and security bypasses. Security architects need a way to delegate complex authorization policies to OPA while executing the actual data filtering directly within the database engine.

## The Mental Model
Open Policy Agent solves this dilemma through **Partial Evaluation**. Instead of asking OPA for a final `true/false` decision on a fully-formed request, the application server requests a *partial* decision by defining what parameters are known (e.g., user identity, role, department) and leaving the target resource attributes as open variables.

```
+--------+           1. GET /documents           +------------+
| Client | ------------------------------------> | App Server |
+--------+                                       +------------+
                                                   /        \
                    2. Query OPA: "Evaluate policy  /          \ 4. Compile simplified AST
                       but leave 'doc' as unknown" /            \   into SQL WHERE clause
                                                  v              v
                                               +-----+     +------------+
                                               | OPA |     | SQL Database|
                                               +-----+     +------------+
                                            3. Returns simplified AST:
                                               "doc.tenant_id = '123' AND
                                                (doc.public = true OR doc.owner = 'alice')"
```

OPA evaluates the static parts of the Rego policy and returns a simplified Abstract Syntax Tree (AST) containing only the unresolved conditional expressions related to the unknown variables. The application server compiles this AST directly into a SQL `WHERE` clause, executing a secure, single-roundtrip database query.

## Attack Vectors
1. **Inefficient N+1 Authorization Scans**: Developers trying to implement row-level security without partial evaluation call OPA in a loop for each database result. Attackers can exploit this by requesting giant datasets, overwhelming the application server's CPU and memory, resulting in a self-inflicted Denial of Service (DoS).
2. **Dynamic Query Injection (SQL Injection)**: When converting OPA's AST output into SQL `WHERE` clauses, developers must be extremely careful. If the parser naively concatenates OPA AST string outputs into raw SQL strings without parameterized bindings, attackers who can manipulate OPA attributes (like their own usernames or tenant IDs) can execute SQL injection attacks.
3. **Data Leakage via Policy Mismatch**: If the logic in the Rego policy and the manual database query logic fall out of sync, the system may accidentally expose sensitive tenant data. Having a single source of truth for the policy in OPA is essential.

## Defensive Architecture
Securing dynamic data filtering requires a clear Rego policy structure and a secure AST-to-SQL compiler that utilizes parameterized queries.

### 1. The Rego Policy File
The following policy defines document access rules based on tenant isolation, public status, and document ownership.

```rego
package data_filter

default allow = false

# Complete evaluation for single-item access checks
allow {
    input.user.role == "Admin"
}

# Define the rules for partial evaluation where input.document is left "unknown"
allow {
    input.document.tenant_id == input.user.tenant_id
    visible_document
}

visible_document {
    input.document.is_public == true
}

visible_document {
    input.document.owner == input.user.username
}
```

### 2. Python: Secure OPA Partial Evaluation and Query Compilation
This Python script calls OPA's `/v1/compile` endpoint to perform partial evaluation and parses the output into a safe, parameterized SQL database query.

```python
import requests
import os

OPA_URL = os.getenv("OPA_URL", "http://localhost:8181/v1/compile")

def get_secure_database_query(user_context: dict) -> tuple[str, list]:
    # We define 'input.document' as an unknown variable for partial evaluation
    payload = {
        "query": "data.data_filter.allow = true",
        "input": {
            "user": user_context
        },
        "unknowns": ["input.document"]
    }
    
    response = requests.post(OPA_URL, json=payload).json()
    
    # Parse OPA AST conditional blocks
    queries = response.get("result", {}).get("queries", [])
    sql_clauses, params = [], []
    
    for query in queries:
        clause_parts = []
        for expr in query:
            if expr.get("terms")[0].get("value") == "equal":
                left = expr["terms"][1]["value"]
                right = expr["terms"][2]["value"]
                column_name = left[-1]
                clause_parts.append(f"{column_name} = ?")
                params.append(right)
        
        if clause_parts:
            sql_clauses.append(" AND ".join(clause_parts))
            
    # Join rules with OR
    final_where_clause = " OR ".join(f"({clause})" for clause in sql_clauses)
    final_sql = f"SELECT * FROM documents WHERE {final_where_clause}"
    
    return final_sql, params
```

## Best Practices
- **Never String Concatenate**: Always compile the OPA AST into parameterized queries or use established ORM libraries (like SQLAlchemy or Prisma) to prevent SQL Injection.
- **Fail Safe**: If OPA returns an empty query list or fails to respond, block all queries and return zero records.
- **Isolate Environments**: Use low-latency sidecar deployments for OPA to minimize communication latency during the `/v1/compile` handshake.
