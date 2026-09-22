# OAuth Scopes vs. Application Roles: Limiting API Blast Radius

## The Problem: Confusing Client Delegation with User Permissions
One of the most pervasive design errors in modern API development is treating **OAuth Scopes** as **User Roles** or **Internal Permissions** (e.g., assigning a scope of `admin` to a token because the user is an administrator).

When you conflate scopes with roles, you open up a massive security vulnerability:
*   An OAuth Scope does **not** grant permissions to a user.
*   An OAuth Scope is a **delegation constraint** placed on a client application. It declares: *"The user is letting this third-party client application do X on their behalf."*

If your system grants full admin rights to a third-party integration simply because an administrator logged in and authorized it, the blast radius of that third-party token is unlimited. If that third-party client gets breached, the attacker gains full administrative access to your core infrastructure.

True API security requires **Dual-Key Authorization**: evaluating the intersection of **User Permissions** (what the user is allowed to do) and **Client Scopes** (what the user has permitted the client to do).

---

## Technical Architectures: The Intersection of Privilege

```
   USER ROLES & PERMISSIONS                    CLIENT OAUTH SCOPES
 (e.g., Read, Write, Delete)                 (e.g., read:reports, write:reports)
     +-------------------+                       +-------------------+
     |                   |                       |                   |
     |   * read:reports  |                       |   * read:reports  |
     |   * write:reports |   INTERSECTION (AND)  |   * write:billing |
     |   * delete:reports|======================>|                   |
     |   * write:billing |                       |   [GRANTED AREA]  |
     |                   |                       |   Only actions in |
     +-------------------+                       |   both are valid  |
                                                 +-------------------+
                                                           |
                                                           v
                                                  EFFECTIVE AUTHORITY:
                                                    * read:reports
```

### The Scenario
An administrator (User) has full `read:reports` and `delete:reports` rights. They log into a third-party Reporting Assistant (Client) but only grant the client `read:reports` scope. 
*   If the Client attempts to `delete:reports`, the API must **reject** the request because the client lacks the delegated scope, even though the authorizing user is an admin.
*   Conversely, if a restricted viewer (User) has only `read:reports` rights but the Client requests `write:reports` scope, the API must **reject** any write attempt because the user lacks the permission.

---

## Robust Code: Dual-Key Authorization Middleware
Below is a complete TypeScript Express middleware implementing the Dual-Key authorization pattern. It checks both the user's role/permissions (RBAC) and the token's delegated scopes to determine effective authority.

```typescript
import { Request, Response, NextFunction } from 'express';

interface TokenPayload {
  sub: string;
  scope: string; // Space-separated string of delegated scopes, e.g., "read:reports write:billing"
  userId: string;
}

interface UserProfile {
  id: string;
  role: 'Admin' | 'BillingManager' | 'StandardUser';
  permissions: string[]; // Internal granular permissions, e.g., ["read:reports", "delete:reports"]
}

interface AuthenticatedRequest extends Request {
  tokenPayload?: TokenPayload;
  userProfile?: UserProfile;
}

// Simulated User DB lookup
async function fetchUserProfileFromDb(userId: string): Promise<UserProfile> {
  // In production, fetch this from Postgres, MongoDB, or a secure cache
  if (userId === 'usr_admin123') {
    return {
      id: 'usr_admin123',
      role: 'Admin',
      permissions: ['read:reports', 'write:reports', 'delete:reports', 'read:billing']
    };
  }
  return {
    id: 'usr_guest456',
    role: 'StandardUser',
    permissions: ['read:reports']
  };
}

/**
 * Higher-order middleware factory to enforce intersection check
 * @param requiredPermission The internal permission required to run the operation
 * @param requiredScope The client delegation scope required to run the operation
 */
export function enforceDualKeyAuth(requiredPermission: string, requiredScope: string) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    try {
      const token = req.tokenPayload;
      if (!token) {
        return res.status(401).json({ error: 'Unauthenticated' });
      }

      // 1. Resolve User Identity and Permissions (RBAC Check)
      const user = await fetchUserProfileFromDb(token.userId);
      req.userProfile = user;

      const hasUserPermission = user.permissions.includes(requiredPermission);
      if (!hasUserPermission) {
        return res.status(403).json({
          error: `Forbidden: User lacks internal permission "${requiredPermission}"`
        });
      }

      // 2. Parse and Validate Client Delegation Scopes (Scope Check)
      const clientScopes = token.scope ? token.scope.split(' ') : [];
      const hasClientScope = clientScopes.includes(requiredScope);
      if (!hasClientScope) {
        return res.status(403).json({
          error: `Forbidden: Client application lacks delegated scope "${requiredScope}"`
        });
      }

      // Success: Both the user is authorized, and the user has delegated that authority to the client
      next();
    } catch (error) {
      console.error('Authorization processing failure:', error);
      return res.status(500).json({ error: 'Internal Server Error' });
    }
  };
}
```

---

## Architectural Best Practices
1.  **Scope Granularity:** Define narrow, specific scopes (e.g., `read:transactions`, `write:invoices`) rather than wide scopes (e.g., `transactions`, `billing`, `api`). This follows the Principle of Least Privilege.
2.  **Separate Client and User Data:** Keep user attributes, profile roles, and department metadata out of client scope declarations. Scopes belong to the access token's payload; user permissions belong to your internal application database.
3.  **Client-Credentials Flow Scopes:** For machine-to-machine (M2M) communication (where there is no user, e.g., a background daemon service), the scope of the token *does* represent the absolute authority because the client acts as its own resource owner. In this scenario, ensure scopes are audited tightly and restricted to designated tasks.
