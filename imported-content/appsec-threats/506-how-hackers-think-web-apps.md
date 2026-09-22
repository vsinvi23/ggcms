# How Hackers Actually Think About Web Applications

## The Problem: The "Happy Path" Fallacy
Developers build software to follow the "happy path." A user enters a username, enters a password, clicks submit, and views their dashboard.

Hackers do not care about the happy path. They care about state transitions, input parsing, and implicit trust. They look at a web application not as a service, but as a sprawling attack surface full of unvalidated assumptions.

## Phase 1: Mapping and Enumeration
Before a hacker sends a single malicious payload, they map the application. They want to understand the technology stack, the routing logic, and the hidden endpoints.

**Tools of the Trade:**
- **DirBuster / ffuf:** Brute-forcing directories (`/admin`, `/backup.zip`, `/.git`).
- **Wappalyzer:** Identifying the tech stack (e.g., finding out it's running an outdated version of Express.js).
- **Burp Suite:** Intercepting and analyzing every HTTP request.

```text
[ Attacker ] --(Map: /api/v1/user/10)--> [ Web App ]
[ Attacker ] --(Map: /api/v1/user/11)--> [ Web App ]
```
*Observation:* The application uses sequential integer IDs. This indicates potential Insecure Direct Object Reference (IDOR) vulnerabilities.

## Phase 2: Input Fuzzing
Once the map is built, the hacker fuzzes every input field, header, and cookie. Fuzzing means sending unexpected data types to see how the application crashes or responds.

- **String instead of Integer:** What happens if `age="twenty"` is sent to the JSON API? Does it throw a stack trace revealing the database type?
- **Special Characters:** Injecting `'`, `"`, `;`, `<`, `>` to look for SQL Injection or XSS.
- **Null Bytes:** Injecting `%00` to bypass file extension checks (e.g., `malware.php%00.jpg`).

## Phase 3: Bypassing Business Logic
Business logic flaws are the most devastating because no automated scanner can find them. They require understanding the business context.

**Scenario:** An e-commerce checkout cart.
```json
// The intended request
{
  "item_id": 402,
  "quantity": 1,
  "price": 500.00
}
```

**The Hacker's Thought Process:** 
1. *Why is the client sending the price? The server should know the price.*
2. *What happens if I change `price` to `1.00`?*
3. *What happens if I change `quantity` to `-1`? Will the server refund me $500?*

## Phase 4: State Manipulation
Hackers love multi-step processes (e.g., Password Reset, Checkout, Wizard forms) because state must be maintained across HTTP requests.

If a password reset process is:
1. Enter Email -> Receive OTP.
2. Enter OTP -> Get Password Reset Token.
3. Submit New Password + Token.

The hacker will try to skip step 2 and jump directly to step 3, guessing or forging the Token. 

To defend against hackers, developers must stop asking, "Does it work?" and start asking, "How can this be broken?"
