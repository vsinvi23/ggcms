# IDOR Explained with a Real API: Preventing Predictable Reference Attacks

Insecure Direct Object Reference (IDOR) occurs when an application exposes a direct pointer to an underlying database record—such as an auto-incrementing integer key—and fails to validate whether the requester owns or is authorized to access that object. IDOR represents a critical sub-category of Broken Access Control and remains one of the most widely exploited vulnerabilities in modern APIs.

---

## The Problem: The Auto-Incrementing Trap

When designing relational database schemas, it is standard practice to use sequential integers as primary keys (e.g., `id INT AUTO_INCREMENT PRIMARY KEY`). It is fast, index-friendly, and simple. 

However, exposing these internal database keys directly to the client API represents a severe security risk. For example, a user navigates to their account dashboard and notices that their invoice is fetched from this URL:

```
https://api.target-app.com/api/v1/invoices/10042
```

An attacker immediately deduces two facts:
1. The application uses sequential numbering for invoices.
2. Invoices `10041`, `10040`, and `10043` likely exist and contain sensitive personal or financial information of other customers.

By running a simple script to iterate through the IDs, the attacker can systematically download the entire customer invoice database. This is called **Horizontal Privilege Escalation**.

```
+--------------+                   +--------------------+                   +--------------------+
|   Attacker   | --(GET ID 10041)->| Application Server | --(Checks Auth)--> |  Postgres Database |
| (Tenant #99) |                   | (Active Session)   |                    | (Stores All Data)  |
+--------------+                   +--------------------+                   +--------------------+
       |                                     |                                         |
       |  Request:                           |                                         |
       |  GET /invoices/10041                |  Query:                                 |
       |  Cookie: session=tenant99           |  SELECT * FROM invoices                 |
       |                                     |  WHERE id = 10041                       |
       +====================================>|========================================>|
                                             |                                         |
                                             |  Returns Invoice #10041                 |
                                             |  (Belongs to Tenant #23)                |
                                             |<========================================+
       |  Exfiltrates Tenant #23 Financials  |
       |<====================================+
```

---

## Vulnerable Code: The Passive Fetcher

Consider a Python/Flask API endpoint designed to retrieve invoice details:

```python
# VULNERABLE FLASK CONTROLLER
from flask import Flask, request, jsonify, g
import sqlite3

app = Flask(__name__)

# Assume g.user is populated by an authentication decorator with user details:
# g.user = {"id": 99, "role": "USER"}

@app.route('/api/v1/invoices/<int:invoice_id>', methods=['GET'])
def get_invoice(invoice_id):
    # Establish database connection
    conn = sqlite3.connect('app.db')
    cursor = conn.cursor()
    
    # VULNERABILITY: Direct SQL execution targeting the predictable ID.
    # While it utilizes parameterized queries (safeguarding against SQL injection),
    # it completely neglects to verify if g.user["id"] has rights to view invoice_id!
    cursor.execute("SELECT id, amount, billing_address, tenant_id FROM invoices WHERE id = ?", (invoice_id,))
    invoice = cursor.getItem()
    
    if not invoice:
        return jsonify({"error": "Invoice not found"}), 404
        
    invoice_data = {
        "id": invoice[0],
        "amount": invoice[1],
        "address": invoice[2],
        "tenant_id": invoice[3]
    }
    
    return jsonify(invoice_data), 200
```

### The Exploit Vector

The attacker logs in with account `99`, intercepts their own requests, and scripts an iteration sweep:

```python
import requests

# Session cookie for the attacker (Tenant 99)
cookies = {'session': 'attacker_session_token_cookie'}

for target_id in range(10000, 10100):
    url = f"https://api.target-app.com/api/v1/invoices/{target_id}"
    response = requests.get(url, cookies=cookies)
    if response.status_code == 200:
        print(f"Exfiltrated Invoice {target_id}: {response.json()}")
```

The server returns data for every single invoice in that range, regardless of who owns it, because the route handler only checks *if* the user is logged in, not *what data* they are allowed to see.

---

## Securing the API: The Defense Strategy

Mitigating IDOR requires a two-pronged defensive approach: **Indirect Object References** and **Explicit Data-Level Authorization**.

### 1. Indirect Object References (UUIDs)
Replace sequential integer IDs in public APIs with high-entropy, non-predictable identifiers such as UUIDv4 or cryptographic hashes. This makes brute-forcing or iterating references mathematically impossible.

*   **Sequential (Vulnerable):** `10042`
*   **UUIDv4 (Secure):** `f81d4fae-7dec-11d0-a765-00a0c91e6bf6`

### 2. Contextual SQL Queries
Never execute database operations that select records based solely on the object ID. Incorporate the authenticated user's ID or tenant ID directly into the database query's `WHERE` clause.

*   **Vulnerable Query:** `SELECT * FROM invoices WHERE id = ?`
*   **Secure Query:** `SELECT * FROM invoices WHERE id = ? AND tenant_id = ?`

---

## Secure Implementation: IDOR-Resistant API (Python)

Below is the hardened Flask route using UUIDs and contextual SQL queries to guarantee that a user can only query their own resources.

```python
import uuid
from flask import Flask, request, jsonify, g
import psycopg2 # Using postgres for production-grade pool
from db_pool import get_db_connection # Helper

app = Flask(__name__)

# Production decorator for session management and identity extraction
def require_auth(f):
    # Authentication logic that sets g.user["id"] and g.tenant_id
    # ...
    return f

@app.route('/api/v1/invoices/<string:invoice_uuid>', methods=['GET'])
@require_auth
def get_invoice_secure(invoice_uuid):
    # Step 1: Validate UUID format to prevent execution of garbage payloads
    try:
        validated_uuid = str(uuid.UUID(invoice_uuid))
    except ValueError:
        return jsonify({"error": "Invalid resource identifier format."}), 400

    conn = get_db_connection()
    try:
        cursor = conn.cursor()
        
        # Step 2: Contextual query constraint
        # We explicitly lock the SELECT statement to the user's active tenant_id.
        # This acts as an iron-clad security perimeter at the database layer.
        query = """
            SELECT id, amount, billing_address, tenant_id 
            FROM invoices 
            WHERE id = %s AND tenant_id = %s
        """
        
        cursor.execute(query, (validated_uuid, g.tenant_id))
        invoice = cursor.fetchone()
        
        # Step 3: Prevent enumerating system existence 
        # If the invoice exists but belongs to someone else, we return a 404 Not Found
        # instead of a 403 Forbidden. This prevents attackers from mapping valid UUIDs.
        if not invoice:
            return jsonify({"error": "Resource not found or unauthorized access."}), 404
            
        invoice_data = {
            "id": invoice[0],
            "amount": invoice[1],
            "address": invoice[2],
            "tenant_id": invoice[3]
        }
        return jsonify(invoice_data), 200

    except Exception as e:
        # Avoid logging database engine errors to the public client
        app.logger.error(f"Database error during invoice fetch: {str(e)}")
        return jsonify({"error": "An internal error occurred."}), 500
    finally:
        cursor.close()
        conn.close()
```

---

## Architectural Protections

1. **Keep Internal Keys Internal:** Use auto-incrementing integers for foreign key performance inside database indexes, but map them to UUIDv4s on write. Maintain a lookup column `external_id` (indexed UUID) that is exposed to the public API layer.
2. **Implement Object-Level Access Control (ABAC):** For complex enterprise architectures, implement policy decision engines (like Open Policy Agent - OPA) to dynamically evaluate ownership and permission metadata before returning objects.
3. **Audit Log Data Access:** Log every resource read. If a user receives more than 5 consecutive `404` or `403` errors targeting different resource IDs within a 1-minute window, trigger an automated account lock and notify security operations.
