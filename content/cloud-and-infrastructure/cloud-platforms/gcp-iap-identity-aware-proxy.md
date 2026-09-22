---
title: "GCP Identity-Aware Proxy: Zero Trust Access Without a VPN"
description: "How Google Cloud's Identity-Aware Proxy replaces corporate VPNs with per-request, identity-based access control at the load balancer, including Terraform setup, IAM authorization, and backend JWT verification."
type: "ARTICLE"
categorySlug: "cloud-platforms"
articleType: "GUIDE"
tags:
  - "gcp"
  - "identity-aware-proxy"
  - "zero-trust"
  - "beyondcorp"
  - "iam"
  - "jwt-validation"
---

# GCP Identity-Aware Proxy: Zero Trust Access Without a VPN

An engineering team stands up an internal admin dashboard for their support staff. The straightforward option is a corporate VPN: employees install a client, authenticate, and get a private IP inside the network perimeter — after which the dashboard, and everything else on that network, trusts them by default. Then someone's laptop gets compromised via a phishing email, the VPN client's session token is stolen, and the attacker now has lateral access to every internal service reachable from that network segment, not just the dashboard they were trying to reach.

This is the structural weakness of perimeter-based security: authentication happens once, at the network edge, and everything behind that edge implicitly trusts the connection. Google Cloud's **Identity-Aware Proxy (IAP)** — the productized form of Google's internal BeyondCorop model — moves the authentication and authorization check to the application layer, on every request, regardless of network location.

## The Problem: VPNs Trust the Network, Not the Request

Traditional VPN-based access control has three structural weaknesses:

1. **All-or-nothing perimeter access.** Once a VPN session is established, most network segmentation still relies on coarse subnet-level firewall rules, not per-application authorization.
2. **Latency and operational overhead.** Tunneling all traffic through a VPN concentrator adds round-trip latency and a single scaling bottleneck.
3. **Violates least privilege by design.** An attacker who compromises *any* credential valid on the VPN typically gains reachability to far more than the one application they were targeting.

## The Solution: Authenticate and Authorize at the Load Balancer, Per Request

IAP sits in front of your HTTP(S) Load Balancer and intercepts every request before it reaches your backend. It checks the caller's identity and their IAM authorization for *that specific backend service* — not the network they're connecting from.

```text
[ Remote Employee ] ---> (Public Internet) ---> [ Google Front End (GFE) + IAP ]
                                                        |
                                          (1. Verify identity via Google Workspace/Cloud Identity)
                                          (2. Check IAM role: IAP-secured Web App User)
                                          (3. Optional: context-aware access — device posture, geo)
                                                        |
                                                  Authorized?
                                                 /             \
                                              YES               NO
                                              /                   \
                            [ Backend Service (GKE/Cloud Run/Compute) ]    [ 403 Forbidden ]
```

Because the check happens on every request rather than once at connection time, a compromised session cookie or stolen device is bounded by exactly the IAM grants attached to that identity for that resource — not the whole internal network.

## Step 1: Put the Application Behind a Global HTTP(S) Load Balancer

IAP is not a standalone product you bolt onto arbitrary infrastructure — it's a capability of the GCP HTTP(S) Load Balancer's Backend Service. The backend can be a Managed Instance Group, a Serverless NEG (for Cloud Run), or a GKE Ingress; IAP works identically regardless of what's actually running the application code.

```hcl
resource "google_compute_backend_service" "internal_app" {
  name     = "internal-app-backend"
  protocol = "HTTP"

  backend {
    group = google_compute_region_network_endpoint_group.cloudrun_neg.id
  }

  # Enable Identity-Aware Proxy on this backend service
  iap {
    oauth2_client_id     = var.oauth_client_id
    oauth2_client_secret = var.oauth_client_secret
  }
}
```

Once `iap {}` is present, the backend is unreachable to anyone until they are explicitly granted access — there is no implicit "internal network" bypass.

## Step 2: Authorize Access via IAM, Not Firewall Rules

Instead of writing subnet-level ACLs, access is granted by binding the `roles/iap.httpsResourceAccessor` role directly to users or groups, scoped to the specific backend service.

```hcl
resource "google_iap_web_backend_service_iam_binding" "app_access" {
  project             = var.project_id
  web_backend_service = google_compute_backend_service.internal_app.name
  role                = "roles/iap.httpsResourceAccessor"

  members = [
    "group:engineering@company.com",
    "user:alice@company.com",
  ]
}
```

This is the key operational shift: adding or removing a user's access to the internal dashboard is a Google Group membership change, not a firewall rule deployment.

## Step 3: The Backend Must Independently Verify the IAP JWT

IAP injects a signed JWT into every forwarded request, in the `X-Goog-IAP-JWT-Assertion` header, containing the verified caller's identity. This is where a common and dangerous mistake creeps in: engineers sometimes assume that because IAP is "in front," any traffic reaching the backend must already be authenticated — and skip validating the header.

**That assumption is false in one specific scenario that matters:** if the backend's network is reachable by *any* other path (a misconfigured internal load balancer, a firewall rule that also allows direct VPC access, a peered network), a request can reach the application without ever passing through IAP, and an unvalidated header is trivially forgeable. The backend must cryptographically verify the JWT's signature against Google's public keys and check the `aud` claim matches its own backend service, on every request — never trust the header's mere presence.

```javascript
const { OAuth2Client } = require('google-auth-library');

// aud must match this exact backend service's audience string
const expectedAudience = '/projects/12345/global/backendServices/67890';
const oAuth2Client = new OAuth2Client();

async function verifyIapToken(jwtToken) {
  if (!jwtToken) {
    throw new Error('Missing X-Goog-IAP-JWT-Assertion header — request did not come through IAP');
  }

  const ticket = await oAuth2Client.verifyIapToken({
    idToken: jwtToken,
    expectedAudience,
  });

  const payload = ticket.getPayload();
  return {
    email: payload.email,       // Verified identity of the caller
    subject: payload.sub,        // Stable Google identifier
  };
}

// Express middleware wiring
app.use(async (req, res, next) => {
  try {
    req.user = await verifyIapToken(req.header('X-Goog-IAP-JWT-Assertion'));
    next();
  } catch (err) {
    res.status(403).send('Forbidden: invalid or missing IAP assertion');
  }
});
```

## Context-Aware Access: Beyond Identity

IAP can be paired with **Context-Aware Access** (via Access Context Manager and VPC Service Controls) to add conditions beyond "is this a valid identity" — for example, requiring a corporate-managed device certificate, or restricting access to specific geographic regions. This is the piece that most directly maps to BeyondCorop's original thesis: access decisions should combine *who* the user is, *what device* they're on, and *the sensitivity of the resource*, evaluated per request.

## Conclusion

IAP relocates the trust boundary from "inside the corporate network" to "this specific authenticated identity, verified on this specific request." It eliminates VPN latency and operational overhead, but the security guarantee only holds if two things are both true: the backend is genuinely unreachable except through the IAP-fronted load balancer, and the backend independently verifies the injected JWT rather than trusting its mere presence. Skipping either check re-introduces exactly the perimeter-trust failure mode IAP exists to remove.
