# Secrets Management for AI Agents: Eliminating Prompt-Driven Credential Leakage

## Problem Statement

To execute downstream tools (e.g., Stripe payments, Slack messages, SendGrid mailing), an AI Agent must have access to credentials. However, injecting API tokens directly into the LLM system prompt, or retrieving them on-the-fly and appending them to the chat history/context window, is a critical security vulnerability. 

Under a prompt injection or jailbreak attack, an attacker can manipulate the LLM into printing its system instructions and dumping all injected environment variables or API keys. To prevent credential theft, we must implement a secure secrets management architecture that completely decouples credential resolution from the LLM prompt context and conversational state.

---

## Technical Architecture

We eliminate prompt-driven credential leakage by isolating secrets within a secure Sandbox Tool Runner and utilizing HashiCorp Vault's Dynamic Secrets engine.

1. **The Abstract Request:** The LLM Agent decides to execute a tool (e.g., `send_email`). It passes only functional arguments (recipient, body) and holds no knowledge of the API key itself.
2. **The Isolation Barrier:** The Tool Runner Sandbox interceptor receives the request.
3. **The Secure Inquiry:** The Tool Runner authenticates with HashiCorp Vault using AppRole credentials.
4. **Dynamic Issuance:** Vault generates an ephemeral, single-use API credential (with a short TTL of 5 minutes) specifically for SendGrid.
5. **The Safe Execution:** The Tool Runner executes the HTTP call to the downstream API using the dynamic token and destroys it immediately after completion.

```
+-------------+          +-------------+          +-------------+          +-------------+
|  LLM Agent  |          | Tool Runner |          | HashiCorp   |          | Target API  |
|   Sandbox   |          | (Sandbox)   |          |    Vault    |          | (SendGrid)  |
+-------------+          +-------------+          +-------------+          +-------------+
       |                        |                        |                        |
       | 1. Request SendEmail   |                        |                        |
       |    (No secret in payload)                       |                        |
       |----------------------->|                        |                        |
       |                        | 2. Fetch Dynamic Token |                        |
       |                        |----------------------->|                        |
       |                        |                        |                        |
       |                        | 3. Issue Short-Lived   |                        |
       |                        |    SendGrid Token      |                        |
       |                        |<-----------------------|                        |
       |                        |                        |                        |
       |                        | 4. Execute API Call (with token)                |
       |                        |------------------------------------------------>|
       |                        |                        |                        |
       |                        | 5. Return Status       |                        |
       |                        |<------------------------------------------------|
       | 6. Return Success      |                        |                        |
       |<-----------------------|                        |                        |
```

---

## Implementation: TypeScript Secure Sandbox Secret Resolution

Below is a robust Node.js/TypeScript implementation demonstrating how the secure Tool Runner authenticates to Vault, fetches an ephemeral credential, and processes a tool call without exposing secrets to the LLM agent.

```typescript
import axios from "axios";

const VAULT_ADDR = process.env.VAULT_ADDR || "https://vault.serenya.local:8200";
const VAULT_ROLE_ID = process.env.VAULT_ROLE_ID!;
const VAULT_SECRET_ID = process.env.VAULT_SECRET_ID!;

class SecretManagementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretManagementError";
  }
}

// Sandbox Tool Executor
export async function executeSendEmailTool(
  recipient: string,
  subject: string,
  body: string
): Promise<{ success: boolean; messageId: string }> {
  let vaultClientToken: string;

  try {
    // 1. Authenticate with Vault using AppRole credentials
    const authResponse = await axios.post(`${VAULT_ADDR}/v1/auth/approle/login`, {
      role_id: VAULT_ROLE_ID,
      secret_id: VAULT_SECRET_ID,
    });
    vaultClientToken = authResponse.data.auth.client_token;
  } catch (error: any) {
    throw new SecretManagementError(`Vault authentication failed: ${error.message}`);
  }

  let sendGridApiKey: string;
  try {
    // 2. Dynamically request an ephemeral API key
    const secretResponse = await axios.get(
      `${VAULT_ADDR}/v1/email-creds/creds/sendgrid-dynamic-role`,
      {
        headers: { "X-Vault-Token": vaultClientToken },
      }
    );
    sendGridApiKey = secretResponse.data.data.api_key;
  } catch (error: any) {
    throw new SecretManagementError(`Failed to fetch dynamic secret: ${error.message}`);
  }

  try {
    // 3. Execute downstream API call using the isolated credential
    const emailResponse = await axios.post(
      "https://api.sendgrid.com/v3/mail/send",
      {
        personalizations: [{ to: [{ email: recipient }] }],
        from: { email: "agent@serenya.edu" },
        subject: subject,
        content: [{ type: "text/plain", value: body }],
      },
      {
        headers: {
          Authorization: `Bearer ${sendGridApiKey}`,
          "Content-Type": "application/json",
        },
        timeout: 4000,
      }
    );
    
    return { 
      success: true, 
      messageId: emailResponse.headers["x-message-id"] || "PENDING" 
    };
  } catch (error: any) {
    throw new SecretManagementError(`Downstream execution failure: ${error.message}`);
  }
}
```

---

## Hardening Strategies

1. **Air-Gapped Prompts:** Never allow secrets to touch any layer of prompt interpolation. The LLM should only ever operate on logical resource pointers (e.g., `email_service_connection`) instead of raw variables.
2. **AppRole IP Pinning:** Restrict AppRole logins inside Vault by defining tight CIDR blocks (`secret_id_num_uses` and `bound_cidr_list`). This guarantees that if AppRole credentials are leaked, they cannot be used outside the dedicated Sandbox runner.
3. **Aggressive Token Lifetimes:** Configure Vault Dynamic Secrets with aggressive leases (e.g., 2 to 5 minutes maximum). If an API key is accidentally output to a debug log, the key will expire automatically before it can be exploited.
