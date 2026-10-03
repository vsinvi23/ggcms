---
title: "Securing Model Context Protocol (MCP) with OAuth 2.0"
description: "MCP transports default to a trust-all model where every tool call runs with the host process's system-level privileges. Fix it by binding user identity to every tool call with scoped OAuth 2.0 bearer tokens and row-level isolation."
type: "ARTICLE"
categorySlug: "ai-llm-security"
articleType: "GUIDE"
tags:
  - "mcp"
  - "model-context-protocol"
  - "oauth-2"
  - "ai-agents"
  - "row-level-security"
  - "typescript"
---

# Securing Model Context Protocol (MCP) with OAuth 2.0

## Problem Statement

As large language models transition from passive text generators to active agents, the Model Context Protocol (MCP) has emerged as an open standard for connecting AI hosts (e.g., Cursor, Claude Desktop) to external data sources and tools. However, MCP transport mechanisms (such as Standard I/O or Server-Sent Events) operate by default on a flat, trust-all model.

When an AI host executes a tool on an MCP server, the server runs with the system-level privileges of whoever started the process. If multiple users query a shared MCP server, there is no inherent isolation: a user can easily access another user's database or cloud resources via the agent. This lack of user-level resource isolation, combined with a missing explicit user-consent mechanism, presents a critical privilege escalation threat.

---

## Technical Architecture & Protocol Flow

To solve this, we must bind the user's identity to the MCP tool call using OAuth 2.0 bearer tokens over the transport layer. In an SSE-based transport, the host application authenticates the user, obtains an access token with restricted scopes (e.g., `mcp:db:read`), and attaches it as a bearer token in the SSE HTTP header.

```
+------------+             +------------+             +------------+             +-----------------+
|  AI Host   |             | MCP Server |             | OAuth IdP  |             | Resource Server |
+------------+             +------------+             +------------+             +-----------------+
      |                           |                          |                            |
      | 1. Tool Request           |                          |                            |
      |-------------------------->|                          |                            |
      |                           | 2. Check Token (401)     |                            |
      |<--------------------------|                          |                            |
      |                           |                          |                            |
      | 3. Auth Redirect/Consent  |                          |                            |
      |<====================================================>|                            |
      |                           |                          |                            |
      | 4. SSE Request + Token    |                          |                            |
      |-------------------------->|                          |                            |
      |                           | 5. Validate Token        |                            |
      |                           |----------------=========>|                            |
      |                           |                          |                            |
      |                           | 6. Scoped Resource Query                              |
      |                           |------------------------------------------------------>|
      |                           |                                                       | DB / API
      |                           | 7. Isolated Data Payload                              |
      |                           |<------------------------------------------------------|
      | 8. Tool Response          |                          |                            |
      |<--------------------------|                          |                            |
```

---

## Implementation: Node.js/TypeScript MCP Server with Token Validation

Below is a Node.js implementation of an MCP server using TypeScript and the official `@modelcontextprotocol/sdk`. It implements token-based authorization and strict user resource isolation.

```typescript
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import jwt from "jsonwebtoken";

const ISSUER = "https://auth.serenya.edu";
const SECRET_DEV_KEY = "DEV_HMAC_SECRET_STRICT_ONLY";

interface UserContext {
  userId: string;
  scopes: string[];
}

const app = express();
const server = new Server(
  { name: "secure-mcp-db-server", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Middleware to extract and validate Bearer Token
function authenticateRequest(req: express.Request): UserContext {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Missing or malformed Authorization header");
  }
  const token = authHeader.split(" ")[1];

  // Verify JWT signature and issuer
  const decoded = jwt.verify(token, SECRET_DEV_KEY, {
    issuer: ISSUER,
    algorithms: ["HS256"],
  }) as any;

  return {
    userId: decoded.sub,
    scopes: decoded.scope ? decoded.scope.split(" ") : [],
  };
}

// Map SSE connections to verified user contexts
const connectionContexts = new Map<string, UserContext>();

app.get("/sse", (req, res) => {
  try {
    const userContext = authenticateRequest(req);
    const transport = new SSEServerTransport("/messages", res);

    // Bind token claims to the unique transport session
    connectionContexts.set(transport.sessionId, userContext);

    server.connect(transport).catch(console.error);

    req.on("close", () => {
      connectionContexts.delete(transport.sessionId);
    });
  } catch (error: any) {
    res.status(401).json({ error: error.message });
  }
});

// Implement Tool logic with Resource Isolation
server.setRequestHandler(async (request) => {
  const { tool, arguments: args, sessionId } = request.params as any;
  const userContext = connectionContexts.get(sessionId);

  if (!userContext) {
    throw new Error("Unauthorized: Active session context not found");
  }

  if (tool === "query_user_database") {
    // Strict Scope Verification
    if (!userContext.scopes.includes("mcp:db:read")) {
      throw new Error("Forbidden: Insufficient scopes");
    }

    const targetId = args.recordId;

    // Strict parameterized database query enforcing user boundary
    const query = "SELECT * FROM user_records WHERE user_id = $1 AND id = $2";
    const dbParams = [userContext.userId, targetId];

    return {
      content: [
        {
          type: "text",
          text: `Executing query: ${query} with bound params: ${JSON.stringify(dbParams)}`,
        },
      ],
    };
  }
  throw new Error("Tool not found");
});
```

The critical line is the WHERE clause: `WHERE user_id = $1 AND id = $2`. The `userId` bound into that query comes from the verified JWT claim, not from any argument the LLM supplied — so even if a prompt injection convinces the model to request another user's `recordId`, the query is still scoped to the caller's own `userId` and returns nothing.

---

## Hardening & Isolation Strategies

1. **Header-Based SSE Authentication:** Always transmit tokens inside standard HTTP authorization headers rather than query strings. Transport layers must enforce TLS 1.3 to avoid token leakage.
2. **Dynamic User Consent Dialogs:** The host application should intercept any tool invocation requesting write or destructive actions (e.g., `mcp:db:write`) and present a structured approval interface to the user prior to execution.
3. **Downstream Row Level Security (RLS):** Ensure that the backend databases use RLS keyed directly on the validated `userId` extracted from the bearer token. This guarantees data-level isolation even if the agent attempts to request other users' records.

## Key Takeaways

- An MCP server with no token validation runs every tool call at the privilege of the process owner — not the requesting user. That's a privilege-escalation bug waiting to happen the moment the server is shared.
- Bind identity to the transport session (SSE `sessionId` → verified `UserContext`), never to arguments the LLM supplies in the tool call itself.
- Scope enforcement and row-level isolation must live in the same trust boundary as the database query, not in the agent's reasoning — the agent's intent is not a security control.
