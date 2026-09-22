# Designing Secure APIs: Mitigating OWASP API Security Risks in Production

> Master the defensive patterns required to protect web APIs and microservices from critical real-world vulnerabilities like Broken Object-Level Authorization (BOLA), Mass Assignment, and Unrestricted Resource Consumption.

---

## What We Are Going to Learn

In this deep-dive guide, we will transition from basic API endpoint design to a highly secure, production-hardened API architecture. 

Specifically, we will cover:
1. **Broken Object-Level Authorization (BOLA/IDOR)** and why perimeter security (like logging in) is insufficient.
2. **Broken Object Property-Level Authorization (BOPLA)** and how to block Mass Assignment attacks.
3. **Unrestricted Resource Consumption** and how to engineer rate limiters using the Token Bucket algorithm.
4. **Writing defensive, secure endpoints** using Python/FastAPI and Pydantic validation layers.

---

## The Problem: The Exploding API Attack Surface

In modern web applications, the frontend (React, Angular, Mobile) is separated from the backend. The backend acts as a headless engine, exposing raw data endpoints via JSON over HTTP:

```
    Frontend UI  ----->  GET /api/v1/orders/9983  ----->  Backend API
```

This headless architecture shifts the responsibility of data rendering to the client. Consequently, many backends are designed to simply dump raw database records into JSON payloads, relying on the frontend to hide sensitive fields or block unauthorized actions. 

This leads to several critical security gaps:
* **Authorization Bypass (BOLA):** An attacker logs in legally as User A. They capture their API requests, change the URL parameter from `/api/v1/users/9901` (User A's profile) to `/api/v1/users/9902` (User B's profile), and read User B's raw data directly.
* **Mass Assignment (BOPLA):** A registration endpoint expects a client to send username and password. An attacker sends an extra property: `"is_admin": true` or `"role": "superuser"`. If the backend blindly maps the input JSON to a database entity, the attacker elevates their own privileges.
* **API Denial of Service:** A client requests an un-indexed search query or requests 1,000,000 records in a single page limit (`GET /api/v1/logs?limit=1000000`), exhausting the server's CPU and memory, crashing the database.

---

## Why the Problem Is Hard: Perimeter Security Is Not Object Security

Most enterprise setups deploy robust firewalls, Web Application Firewalls (WAFs), and secure login portals:

```
  Attacker ---> [ Firewalls & API Gateway ] ---> [ Customer Profile Controller ]
```

These perimeters excel at **authentication** (they prove that the caller has a valid user account and token). However, they have no visibility into **object ownership** (they do not know if User ID `9901` actually owns Order ID `9983`). 

Validating object-level authorization is incredibly hard because it cannot be performed generically at the gateway; it requires context-specific checks inside the database queries or controller logic of every individual microservice.

---

## A Simple Mental Model: The Hotel Room Access Control

Think of API security like a secure hotel:

```
                           HOTEL LOBBY (API Gateway)
                                       |
                =================================================
                |                                               |
         [ Naive Security ]                             [ Modern Security ]
                |                                               |
   You prove your identity at the front           You prove your identity at the lobby.
   desk and get a room keycard.                   You are issued a keycard.
   The keycard opens EVERY room in                However, the keycard is programmed
   the hotel because "you are a checked-          to open ONLY Room 402 (Object-Level
   in guest" (BOLA Vulnerability).               Authorization).
```

* **Authentication (Lobby):** Proves you are a guest.
* **Authorization (Door):** Proves you have the right to open *this specific door*.
* **Property Limitation (Minibar):** Even if you are inside Room 402, you cannot access administrative utility closets or open the safe unless explicitly authorized (BOPLA / Property-Level Security).

---

## Under the Hood: Resolving the OWASP API Top 3 Risks

Let's dissect the mechanics and mitigations for the three most common OWASP API Security risks.

### 1. API1:2023 - Broken Object-Level Authorization (BOLA)
BOLA occurs when a user accesses a resource they do not own by modifying the resource identifier (ID) in the API request.

```http
GET /api/v1/invoices/10058964 HTTP/1.1
Authorization: Bearer valid_token_for_user_9999
```

If the backend code is written naively:
```python
# VULNERABLE CODE
@app.get("/api/v1/invoices/{invoice_id}")
def get_invoice(invoice_id: int):
    # Bug: Checks if invoice exists, but NEVER checks if the current user owns it!
    return db.query(Invoice).filter_id(invoice_id).first()
```

#### The Mitigation Pattern
Never rely on the client's input for identity. Always fetch the user's ID from the **authenticated token claims**, and include the owner ID directly in the database lookup query:

```python
# SECURE MITIGATION
@app.get("/api/v1/invoices/{invoice_id}")
def get_invoice(invoice_id: int, current_user: User = Depends(get_current_user)):
    # Explicitly scope the query by BOTH the invoice ID and the authenticated user's ID
    invoice = db.query(Invoice).filter(
        Invoice.id == invoice_id,
        Invoice.owner_id == current_user.id
    ).first()
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    return invoice
```

---

### 2. API3:2023 - Broken Object Property-Level Authorization (BOPLA)
BOPLA merges two classical vulnerabilities: **Excessive Data Exposure** (reading properties) and **Mass Assignment** (writing properties).
An attacker submits an HTTP PATCH request to update their profile, but includes properties they shouldn't edit:

```http
PATCH /api/v1/users/me HTTP/1.1
Content-Type: application/json

{
  "username": "attacker",
  "is_premium_member": true,
  "account_balance": 1000000.00
}
```

If the database is updated directly using an unvalidated dictionary representation of the incoming request body, the attacker edits administrative columns.

#### The Mitigation Pattern
Enforce a strict separation between **Input Models** (Request DTOs), **Internal Database Models**, and **Output Models** (Response DTOs).

```
  Client JSON  --->  Pydantic Request Schema (Read-only properties omitted)
                            ↓
                     Database Update (Strict mapping)
                            ↓
  Database Row --->  Pydantic Response Schema (Filters out internal password/salt columns)
                            ↓
  Filtered JSON ---> Client
```

---

### 3. API4:2023 - Unrestricted Resource Consumption
This covers rate-limiting and resource-exhaustion failures. If your API does not enforce execution limits, attackers can exhaust memory, CPU, or database connections.

#### The Token Bucket Rate Limiting Algorithm
The standard for high-performance production rate limiting is the **Token Bucket** algorithm, often managed inside a Redis cache cluster.
* A bucket has a maximum capacity $C$ of tokens.
* Tokens are added to the bucket at a constant fill rate $r$ tokens/second.
* Every API request consumes 1 token. If the bucket is empty, the request is rejected with HTTP `429 Too Many Requests`.

```
  Tokens filling at rate (r) --->  \````````````/
                                   \  Tokens    /  Capacity (C)
                                    \__________/
                                         |
                                         | Consumes 1 Token per Request
                                         v
                                  [ Process API ]
```

---

## Code Example: Production-Ready Secure API Endpoint

Below is a complete, robust, production-ready Python implementation using **FastAPI** and **Pydantic** showing how to write a secure endpoint that mitigates BOLA, BOPLA (Mass Assignment), and Excessive Data Exposure simultaneously.

```python
from fastapi import FastAPI, Depends, HTTPException, status
from pydantic import BaseModel, Field, EmailStr
from typing import Optional, List

app = FastAPI(title="Hardened API")

# --- DATABASE SIMULATION ---
USERS_DB = {
    "usr_101": {"id": "usr_101", "email": "alice@secure.com", "role": "user", "is_active": True},
    "usr_102": {"id": "usr_102", "email": "bob@hack.com", "role": "user", "is_active": True}
}

INVOICES_DB = {
    "inv_8001": {"id": "inv_8001", "owner_id": "usr_101", "amount": 250.50, "status": "paid", "internal_notes": "Premium customer high priority"},
    "inv_8002": {"id": "inv_8002", "owner_id": "usr_102", "amount": 19.99, "status": "unpaid", "internal_notes": "Repeated decline risk"}
}


# --- SECURITY AUTH SIMULATION ---
def get_current_user() -> dict:
    """Mock dependency representing extraction of authenticated user from JWT."""
    # Simulating that Bob (usr_102) is the authenticated caller making the request
    return USERS_DB["usr_102"]


# --- PYDANTIC SCHEMAS (Mitigating BOPLA/Mass Assignment) ---
class InvoiceUpdateRequest(BaseModel):
    """
    Input validation DTO.
    Attackers cannot perform Mass Assignment because admin columns like
    'owner_id' or 'internal_notes' are explicitly omitted from this model.
    """
    amount: Optional[float] = Field(None, gt=0, description="Updated invoice amount")
    status: Optional[str] = Field(None, regex="^(paid|unpaid|cancelled)$")


class InvoiceResponse(BaseModel):
    """
    Output serialization DTO.
    Prevents Excessive Data Exposure (BOPLA) by omitting 'internal_notes' from serialization.
    """
    id: str
    owner_id: str
    amount: float
    status: str

    class Config:
        orm_mode = True


# --- HARDENED ENDPOINTS ---

@app.get("/api/v1/invoices/{invoice_id}", response_model=InvoiceResponse)
def get_invoice(invoice_id: str, current_user: dict = Depends(get_current_user)):
    """
    Secure Invoice retrieval endpoint.
    Mitigates BOLA by explicitly verifying that the resource owner matches the caller.
    """
    invoice = INVOICES_DB.get(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
    
    # BOLA CHECK: Verify resource ownership
    if invoice["owner_id"] != current_user["id"]:
        print(f"[!] SECURITY ALERT: User {current_user['id']} attempted unauthorized access to invoice {invoice_id}!")
        # Fail open securely: Return 404 instead of 403 to prevent resource existence enumeration (harvesting)
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    return invoice


@app.patch("/api/v1/invoices/{invoice_id}", response_model=InvoiceResponse)
def update_invoice(
    invoice_id: str, 
    update_data: InvoiceUpdateRequest, 
    current_user: dict = Depends(get_current_user)
):
    """
    Secure Invoice updates.
    Mitigates Mass Assignment and BOLA simultaneously.
    """
    invoice = INVOICES_DB.get(invoice_id)
    if not invoice:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # BOLA CHECK
    if invoice["owner_id"] != current_user["id"]:
        raise HTTPException(status_code=404, detail="Invoice not found")
        
    # Apply safe update (only mapped schema keys are processed)
    update_dict = update_data.dict(exclude_unset=True)
    for key, value in update_dict.items():
        invoice[key] = value
        
    INVOICES_DB[invoice_id] = invoice
    return invoice


# --- TESTING SIMULATION ---
if __name__ == "__main__":
    print("[*] Testing Hardened API Endpoints Locally...")
    
    # 1. Simulate Bob retrieving his OWN invoice (inv_8002) - Should Succeed
    print("\n[Test 1] Bob fetching his own invoice (inv_8002):")
    try:
        res = get_invoice(invoice_id="inv_8002", current_user=USERS_DB["usr_102"])
        print("Succeeded! Response Payload:", res)
    except HTTPException as e:
        print("Failed:", e.detail)

    # 2. Simulate Bob attempting to fetch Alice's invoice (inv_8001) - Should Fail (BOLA Defeated)
    print("\n[Test 2] Bob attempting to fetch Alice's invoice (inv_8001) [BOLA Attack]:")
    try:
        res = get_invoice(invoice_id="inv_8001", current_user=USERS_DB["usr_102"])
        print("Response Payload:", res)
    except HTTPException as e:
        print(f"Defeated! Server returned: HTTP {e.status_code} - {e.detail}")

    # 3. Simulate Bob updating his invoice status using a valid Pydantic model - Should Succeed
    print("\n[Test 3] Bob updating invoice amount via validated DTO:")
    try:
        update_dto = InvoiceUpdateRequest(amount=45.00)
        res = update_invoice(invoice_id="inv_8002", update_data=update_dto, current_user=USERS_DB["usr_102"])
        print("Succeeded! Updated Invoice:", res)
    except HTTPException as e:
        print("Failed:", e.detail)
