---
title: "API Authentication vs Authorization: Mitigating BOLA and BOPLA"
description: "Why mixing up authentication and authorization is a fatal API design error, and how to build object-level and property-level access control that stops IDOR/BOLA and mass-assignment/BOPLA attacks."
categorySlug: "appsec-threats"
articleType: "GUIDE"
tags:
  - "bola"
  - "bopla"
  - "broken-object-level-authorization"
  - "mass-assignment"
  - "api-security"
  - "owasp-api-top-10"
---

# API Authentication vs API Authorization: Mitigating BOLA and BOPLA

In modern application security, mixing up **Authentication (AuthN)** and **Authorization (AuthZ)** is a fatal engineering error.

* **Authentication** validates identity: *"Are you who you say you are?"* (typically solved via credentials, multi-factor codes, or JWTs).
* **Authorization** validates permissions: *"Do you have the right to execute this action on this resource?"*

APIs are incredibly prone to authorization failures. Even if your authentication engine is flawless, a lack of deep, resource-level authorization controls directly triggers the two most common and damaging OWASP API Top 10 threats: **BOLA** (Broken Object Level Authorization) and **BOPLA** (Broken Object Property Level Authorization).

---

## The Problem: BOLA and BOPLA Visualized

Both threats exploit the stateless nature of APIs, occurring after a client successfully completes the authentication phase.

```text
       [ Client Request ] ---> [ Authentication Middleware ] ---> [ API Route Controller ]
                                          |                                |
                             Passes: User is authenticated.    How does it authorize?
                             (e.g., User ID = 99)                         |
                                                                          |
                    +-----------------------------------------------------+-----------------------------------------------------+
                    |                                                                                                           |
                    v                                                                                                           v
        [ BOLA Vector (Targeting Object) ]                                                         [ BOPLA Vector (Targeting Fields) ]
        - Request: GET /api/accounts/1042                                                          - Request: PATCH /api/profile
        - Backend Check: Is user logged in? Yes.                                                   - Payload: {"email": "a@a.com", "role": "ADMIN"}
        - FLAW: Database fetches account 1042                                                      - FLAW: API blindly updates model using raw body,
          without confirming User 99 owns Account 1042.                                              escalating User 99 to ADMIN (Mass Assignment).
```

### 1. BOLA (Broken Object Level Authorization)

BOLA (traditionally known as IDOR) occurs when an endpoint accepts a resource identifier (e.g., `/api/v1/trips/:trip_id`) and fails to verify that the validated user owns or has access rights to that specific resource ID.

### 2. BOPLA (Broken Object Property Level Authorization)

BOPLA merges the legacy categories of **Mass Assignment** and **Excessive Data Exposure**. It occurs when:

* **Input BOPLA:** The API endpoint blindly maps user-controlled request bodies directly to database objects, allowing attackers to overwrite sensitive properties (e.g., updating `"is_vip": true` or `"balance": 999999`).
* **Output BOPLA:** The API returns raw database objects directly to the front-end, relying on the UI to filter out sensitive attributes (e.g., returning `password_hash`, `mfa_secret`, or `admin_notes` over the network).

---

## Vulnerable Code: The Passive Mongoose Controller

Consider this Express.js controller handling user accounts:

```javascript
// VULNERABLE EXPRESS API CONTROLLER
const express = require('express');
const User = require('./models/user');
const app = express();

// AuthN Middleware: Validates JWT and populates req.user = { id: 99, role: "USER" }
app.use(authenticateToken);

// VULNERABILITY 1: BOLA
// Anyone with a valid JWT can request ANY userId, bypassing authorization checks!
app.get('/api/v1/users/:userId', async (req, res) => {
    try {
        const user = await User.findById(req.params.userId);

        // VULNERABILITY 2: BOPLA (Output - Excessive Data Exposure)
        // Dumping the raw document includes sensitive fields like password hashes over the wire.
        return res.status(200).json(user);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});

// VULNERABILITY 3: BOPLA (Input - Mass Assignment)
app.patch('/api/v1/users/:userId', async (req, res) => {
    try {
        // Blindly spreading req.body into the update query.
        // If the attacker inserts "role": "ADMIN" in the JSON payload, it gets committed!
        const updatedUser = await User.findByIdAndUpdate(
            req.params.userId,
            { $set: req.body },
            { new: true }
        );
        return res.status(200).json(updatedUser);
    } catch (err) {
        return res.status(500).json({ error: err.message });
    }
});
```

---

## Secure Mitigation: Scope Gates and Strict DTO Serialization

Eliminating BOLA and BOPLA requires introducing strict **Access Control Policies** and **Data Transfer Objects (DTOs)**.

1. **Object-Level Guardrails (BOLA fix):** Build an explicit verification layer checking if the authenticated `req.user.id` is authorized to access the specific database document *before* processing requests.
2. **Strict Input Whitelisting / DTOs (BOPLA input fix):** Define strict data structures for incoming payloads. Only allow modifications to explicitly declared, non-sensitive properties.
3. **Data Serialization / Masking (BOPLA output fix):** Strip database schemas down to clean, sanitized JSON representations before sending them over the network. Never dump database documents directly.

### Production-Grade Secure Implementation (Node.js/TypeScript)

Below is a robust API controller utilizing schema validation (via Zod) to enforce strict property constraints (DTOs) and deep object-level authorization gates.

```typescript
import { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { UserModel } from './models/user';

// Step 1: Define strict schemas for input validation (BOPLA Input Prevention)
const UserUpdateSchema = z.object({
    displayName: z.string().min(2).max(50).optional(),
    bio: z.string().max(200).optional(),
    phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/).optional()
    // Notice that properties like 'role', 'isVerified', and 'balance' are strictly omitted here.
    // Even if passed in the payload, they will be completely discarded by Zod during parsing.
});

// Step 2: Define strict serialization structures for output (BOPLA Output Prevention)
interface SafeUserDTO {
    id: string;
    username: string;
    displayName: string;
    bio?: string;
    createdAt: Date;
}

function serializeUser(userDoc: any): SafeUserDTO {
    return {
        id: userDoc._id.toString(),
        username: userDoc.username,
        displayName: userDoc.displayName || userDoc.username,
        bio: userDoc.bio,
        createdAt: userDoc.createdAt
    };
}

export class UserController {

    /**
     * Fetch user with strict BOLA and BOPLA output controls
     */
    static async getUserSecure(req: Request, res: Response): Promise<Response> {
        const { userId } = req.params;
        const currentUser = req.user; // Set by authentication middleware

        try {
            // Check authorization (BOLA Prevention)
            // Users can only view their own record unless they hold the SYSTEM_AUDITOR or ADMIN role.
            if (currentUser.id !== userId && currentUser.role !== 'ADMIN' && currentUser.role !== 'SYSTEM_AUDITOR') {
                console.warn(`[AUTH SYSTEM] BOLA Attempt Blocked: User ${currentUser.id} attempted to read profile of User ${userId}`);
                return res.status(404).json({ error: "User profile not found." }); // Return 404 to prevent resource existence enumeration
            }

            const targetUser = await UserModel.findById(userId).exec();
            if (!targetUser) {
                return res.status(404).json({ error: "User profile not found." });
            }

            // Return strictly serialized DTO to prevent Excessive Data Exposure (BOPLA Output)
            return res.status(200).json(serializeUser(targetUser));

        } catch (error) {
            console.error(`[ERROR] Secure user fetch failed:`, error);
            return res.status(500).json({ error: "Internal server error." });
        }
    }

    /**
     * Update user with strict BOLA and BOPLA input validation
     */
    static async updateUserSecure(req: Request, res: Response): Promise<Response> {
        const { userId } = req.params;
        const currentUser = req.user;

        try {
            // Check authorization (BOLA Prevention)
            // Only the owner of the account can update their profile.
            if (currentUser.id !== userId) {
                return res.status(403).json({ error: "Access Denied. You do not have permissions to modify this resource." });
            }

            // Validate incoming fields using Zod (BOPLA Input/Mass Assignment Prevention)
            const validationResult = UserUpdateSchema.safeParse(req.body);
            if (!validationResult.success) {
                return res.status(400).json({
                    error: "Bad Request",
                    details: validationResult.error.format()
                });
            }

            // Exclusively extract sanitized data. Ignored/unmapped inputs are discarded.
            const sanitizedUpdateData = validationResult.data;

            const updatedUser = await UserModel.findByIdAndUpdate(
                userId,
                { $set: sanitizedUpdateData },
                { new: true }
            ).exec();

            if (!updatedUser) {
                return res.status(404).json({ error: "User not found." });
            }

            return res.status(200).json({
                message: "Profile updated successfully.",
                data: serializeUser(updatedUser)
            });

        } catch (error) {
            console.error(`[ERROR] Secure user update failed:`, error);
            return res.status(500).json({ error: "Internal server error." });
        }
    }
}
```

---

## Architectural Protections

1. **Context-Aware Database Queries:** In relational databases, enforce object-level security natively within SQL query constructions. Combine the search parameter with ownership logic (`WHERE id = ? AND owner_id = ?`).
2. **Explicit DTO/Serialization Layers:** Mandate that all endpoint controllers must pass database queries through dedicated DTO serializers before dispatching HTTP responses. Ban raw database model dumps at the code review level.
3. **Write Targeted Access Matrix Tests:** Implement automated unit and integration test matrices that verify BOLA and BOPLA boundaries. Ensure that tests attempt to submit unauthorized fields (such as `role: "ADMIN"`) and attempt unauthorized object accesses, asserting that they fail gracefully.
