---
title: "AWS Cognito: User Pools vs Identity Pools and External Federation"
description: "How to correctly separate AWS Cognito User Pools (identity/authentication) from Identity Pools (AWS credential exchange), federate external IdPs like Okta or Google, and avoid the over-provisioned guest-role vulnerability."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "aws-cognito"
  - "federation"
  - "sts"
  - "oidc"
  - "saml"
  - "abac"
---

# AWS Cognito: User Pools vs Identity Pools and External Federation

## The Problem: The Cognitive Friction of AWS Cognito Dual Architectures

When designing application security on AWS, developers frequently confuse AWS Cognito User Pools (CUP) and AWS Cognito Identity Pools (CIP). This confusion often leads to major architectural anti-patterns, such as passing high-privilege master AWS credentials to client applications or manually managing database credentials to write user-specific files to S3.

Misunderstanding how these two components interface can also result in massive security vulnerabilities. For example, over-provisioning permissions on the IAM roles associated with Identity Pools can allow unauthenticated guests to delete items from DynamoDB or download private objects from S3. To build a secure, serverless application, developers must understand when to use User Pools for identity management, when to use Identity Pools for AWS authorization, and how to federate external identity providers (like Google or Okta) securely.

## The Mental Model: Authentication vs. Authorization

To clarify the relationship, we must separate authentication (who you are) from authorization (what AWS resources you can access).

1. **Cognito User Pools (CUP):** This is your **identity provider**. It is a managed user directory handling sign-up, sign-in, password recovery, MFA, and standard token generation. Successful authentication returns OIDC JSON Web Tokens: an `id_token` (user claims), an `access_token` (access scopes), and a `refresh_token`.
2. **Cognito Identity Pools (CIP):** This is your **token exchange engine** (or security token service). It does not maintain a user directory. Instead, it accepts external identity tokens (from CUP, SAML providers, or social logins) and exchanges them for temporary, limited-privilege AWS credentials (IAM access keys, secret keys, and session tokens).

```
+------------+       (1) Sign-in        +-----------+
|            |------------------------->|   User    |
|   Client   |<-------------------------|   Pool    |
|    App     |    (2) ID/Access Token   +-----------+
|  (Mobile/  |
|    Web)    |       (3) Exchange OIDC Token     +-----------+
|            |---------------------------------->| Identity  |
|            |<----------------------------------|   Pool    |
|            |     (4) Temporary IAM Creds       +-----------+
+------------+
      |
      | (5) PutObject (Write directly using IAM session token)
      v
+------------+
|  S3 Bucket |
+------------+
```

With external federation, a third-party Identity Provider (IdP) takes the place of (or works alongside) the User Pool. The integration utilizes either OIDC or SAML 2.0.

During federation, the client authenticates with the external IdP (e.g., Okta). The IdP returns a signed assertion (SAML response or JWT). The client sends this assertion to the Cognito Identity Pool, which calls the AWS Security Token Service (STS) via `AssumeRoleWithWebIdentity` to assume a specific IAM role configured for that federated user.

## Client-Side Authentication and S3 Access Example

Below is a JavaScript (v3 SDK) pattern showing how a client authenticates with a User Pool, exchanges the token with an Identity Pool, and obtains AWS credentials to upload a file to S3:

```javascript
import { CognitoUserPool, CognitoUser, AuthenticationDetails } from 'amazon-cognito-identity-js';
import { fromCognitoIdentityPool } from '@aws-sdk/credential-providers';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';

// 1. Authenticate with Cognito User Pool
const poolData = { UserPoolId: 'us-east-1_xxxxx', ClientId: 'yyyyy' };
const userPool = new CognitoUserPool(poolData);
const authDetails = new AuthenticationDetails({ Username: 'user@serenya.com', Password: 'Password123!' });
const cognitoUser = new CognitoUser({ Username: 'user@serenya.com', Pool: userPool });

cognitoUser.authenticateUser(authDetails, {
    onSuccess: async (session) => {
        const idToken = session.getIdToken().getJwtToken();
        const loginKey = `cognito-idp.us-east-1.amazonaws.com/${poolData.UserPoolId}`;

        // 2. Exchange ID Token for temporary IAM credentials via Identity Pool
        const credentials = fromCognitoIdentityPool({
            clientConfig: { region: 'us-east-1' },
            identityPoolId: 'us-east-1:zzzzz-zzzz-zzzz',
            logins: {
                [loginKey]: idToken
            }
        });

        // 3. Initialize S3 client using assumed IAM credentials
        const s3 = new S3Client({ region: 'us-east-1', credentials });

        await s3.send(new PutObjectCommand({
            Bucket: 'serenya-user-uploads',
            Key: 'private/user@serenya.com/report.pdf',
            Body: 'Document Content'
        }));

        console.log("Uploaded successfully using temporary IAM credentials!");
    },
    onFailure: (err) => { console.error("Auth failed:", err); }
});
```

## The ABAC-Scoped IAM Role

The Identity Pool's IAM role should never grant blanket S3 access. Instead, it should use session tags — populated from the User Pool's JWT claims — so each federated identity can only reach its own path:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": ["s3:GetObject", "s3:PutObject"],
      "Resource": "arn:aws:s3:::serenya-user-uploads/private/${aws:PrincipalTag/sub}/*"
    }
  ]
}
```

With this policy, even though every authenticated user assumes the *same* IAM role, the `${aws:PrincipalTag/sub}` interpolation — populated from the Cognito `sub` claim at credential-exchange time — means user `alice` can never read or write under `private/bob/`, regardless of what path she requests.

## Core Security Hardening Rules

1. **Never Hardcode IAM Roles:** Avoid writing AWS IAM keys in application packages. Always fetch credentials dynamically via Identity Pools.
2. **Restrict Guest/Unauthenticated Access:** Identity Pools allow "Unauthenticated identities." Ensure this is either disabled or mapped to an IAM role with near-zero permissions (e.g., restricted strictly to a public S3 folder path). This is the single most common Cognito misconfiguration audited in the wild — a permissive guest role effectively removes authentication from the entire data plane.
3. **Enforce Attribute-Based Access Control (ABAC):** Use claims in the User Pool JWT to map to IAM session tags. Configure IAM policies to authorize access based on matching tags, ensuring a user can only read/write S3 files where the S3 path matches their own user ID claim.
4. **Validate the `aud`/`iss` on the ID token before trusting it for exchange:** the Identity Pool's federated login map (`logins`) ties a specific User Pool (by its full issuer URL) to a specific role mapping — misconfiguring this can let tokens from an unrelated pool resolve to the wrong role.

By cleanly separating CUP directories from CIP authorization bridges, and strictly restricting unauthenticated default roles, engineers can build highly secure, highly scalable serverless cloud integrations.
