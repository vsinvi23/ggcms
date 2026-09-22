# Securing Single-Page Apps with Refresh Token Rotation

### The Problem: The Stateless Storage Dilemma
In modern web architectures, Single-Page Applications (SPAs) built with frameworks like React, Vue, or Angular communicate with backend APIs using OAuth 2.0 access tokens. Because access tokens are short-lived (typically 15 to 60 minutes), the SPA needs a mechanism to obtain new access tokens without forcing the user to re-enter credentials constantly. This requires a refresh token.

However, browser-based applications operate in a hostile execution environment. They do not have access to secure storage backends. Storing long-lived refresh tokens in browser-accessible storage (such as `localStorage` or `sessionStorage`) exposes them to theft via Cross-Site Scripting (XSS) attacks. If an attacker injects a malicious script, they can extract the refresh token and gain unauthorized access to APIs indefinitely. Refresh Token Rotation (RTR) is the cryptographic design pattern developed to mitigate this risk.

### Mental Model: Cryptographic Single-Use Tokens
Under Refresh Token Rotation, the authorization server issues a one-time-use refresh token alongside the access token. Every time the SPA exchanges a refresh token for a new access token, the authorization server invalidates the old refresh token and returns a *brand-new* refresh token. 

```
Legitimate Flow (Token Rotation):
SPA --- Sends RT1 ---> [ Auth Server ] (Verifies RT1, marks RT1 used, issues AT2 + RT2)
SPA <-- Returns AT2 + RT2 ---

Breach Scenario (Token Reuse Detection):
Attacker steals RT1 and attempts reuse:
Attacker --- Sends RT1 ---> [ Auth Server ]
                                 │
                 Check: RT1 has ALREADY been used!
                                 │
                                 ▼
                     [ Breach Detected! ]
            - Invalidate RT1, RT2, and entire Family Tree.
            - Force re-authentication for all clients.
```

### Deep Dive: Automatic Breach Detection and Token Families

The real power of Refresh Token Rotation is not just changing the keys, but its built-in detection of token theft. To achieve this, the Authorization Server groups refresh tokens into **Token Families**.

Each refresh token is cryptographically bound to a unique lineage tree. When the legitimate user uses their current refresh token, the server generates a descendant token in the same family.

#### The Race Condition of Theft
If an attacker steals a refresh token (`RT_1`) from the user's browser, there are two possibilities:

1.  **The attacker uses it first:** The attacker sends `RT_1` to the authorization server and gets `RT_2`. When the legitimate user's browser attempts to refresh the session using `RT_1`, the authorization server notices that `RT_1` has already been used.
2.  **The user uses it first:** The legitimate browser refreshes and gets `RT_2`. When the attacker later attempts to use the stolen `RT_1`, the authorization server detects that `RT_1` is being replayed.

In either case, **replay is a high-fidelity indicator of a security breach**. The authorization server acts instantly:
*   It marks the entire token family as compromised.
*   It immediately revokes the current active token (`RT_2`) and all descendant tokens.
*   The legitimate user's active session is terminated, forcing a full interactive login, while the attacker's stolen token is rendered useless.

### Architectural Implementation: Tracking Token Families

To support RTR, the authorization database must maintain state about token usage and familial relationships.

```sql
CREATE TABLE refresh_tokens (
    token_hash VARCHAR(64) PRIMARY KEY,
    token_family VARCHAR(64) NOT NULL,
    parent_token VARCHAR(64) NULL,
    user_id VARCHAR(36) NOT NULL,
    is_used BOOLEAN DEFAULT FALSE,
    expires_at TIMESTAMP NOT NULL
);
```

When a token exchange request arrives, the server executes this atomic transaction:

1.  Locate the token record by hash. If `is_used` is `TRUE`, trigger the **Breach Detection Routine** (revoke all tokens where `token_family` matches).
2.  Set `is_used = TRUE` on the incoming token.
3.  Generate a new random high-entropy token, hash it, and write it to the database with the same `token_family`, setting the `parent_token` to the incoming token's hash.
4.  Return the new token pair to the client.

By structuring refresh tokens as a dynamic chain of single-use credentials, you ensure that even if an attacker successfully extracts a token, their window of opportunity is minuscule, and their first attempt to use it will sound the alarm.
