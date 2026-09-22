# GCP Identity-Aware Proxy (IAP): Securing Internal Web Apps Without VPNs

## The Problem: The Friction and Fragility of Corporate VPNs

For decades, the standard architectural pattern for securing internal corporate applications—such as HR portals, internal wikis, or staging environments—has been the Virtual Private Network (VPN). To access these internal tools, employees must install a VPN client, authenticate, and tunnel their traffic into the corporate network perimeter.

This perimeter-based security model has severe drawbacks. VPNs introduce significant latency, frustrating remote workers. They are complex to maintain and scale. Most critically, they violate the principle of least privilege: once an attacker breaches the VPN perimeter, they often gain lateral access to the entire internal network. The modern workforce requires a Zero Trust approach where access is verified at the application layer, regardless of the user's network location.

## The Solution: Identity-Aware Proxy (IAP)

Google Cloud Identity-Aware Proxy (IAP) replaces the traditional VPN model with a Zero Trust architecture based on Google's internal BeyondCorp initiative. IAP intercepts web requests directed at your applications, verifies the user's identity and device context contextually, and only allows authenticated, authorized traffic to pass through to the backend.

With IAP, internal applications can be safely exposed to the public internet. The "perimeter" shrinks from the edge of the network down to the individual application itself. 

### The Mental Model: The Bouncer at the Door

Visualize IAP as a highly strict bouncer standing directly in front of your application. 

```text
[ Remote Employee ] ---> (Public Internet) ---> [ Google Front End (GFE) & IAP ]
                                                        |
                                              (Authentication & Context Check)
                                                        |
                                                  (Authorized?)
                                                 /             \
                                              YES               NO
                                              /                   \
                            [ Backend Service (GKE/Compute) ]    [ 403 Forbidden ]
```

When a request arrives, IAP pauses the connection and checks:
1. **Identity:** Who is this user? (Validates via Google Workspace or Cloud Identity).
2. **Authorization:** Does this user have the IAM role `IAP-secured Web App User` for this specific resource?
3. **Context (Optional):** Is the user on a corporate-managed device? Are they logging in from a permitted geographic location?

Only if all conditions are met is the request forwarded to the backend.

## Architectural Implementation

IAP integrates seamlessly with GCP's global HTTP(S) Load Balancers. You do not need to modify your application's code to implement the authentication phase; IAP acts as a transparent reverse proxy.

### Step 1: The Load Balancer Integration

To enable IAP, your application must sit behind a global external HTTP(S) Load Balancer. The load balancer terminates the SSL/TLS connection and routes the traffic to a Backend Service (which could be an Instance Group, a Serverless Network Endpoint Group (NEG) for Cloud Run, or a GKE Ingress).

You enable IAP directly on the Backend Service via the GCP Console or Terraform:

```hcl
resource "google_compute_backend_service" "internal_app" {
  name        = "internal-app-backend"
  protocol    = "HTTP"
  
  # Enable Identity-Aware Proxy
  iap {
    oauth2_client_id     = var.oauth_client_id
    oauth2_client_secret = var.oauth_client_secret
  }
}
```

### Step 2: IAM Authorization

Once IAP is enabled, all access is blocked by default. You grant access by assigning IAM roles at the resource level. Instead of configuring complex network firewall rules, you use standard IAM policies.

```hcl
resource "google_iap_web_backend_service_iam_binding" "app_access" {
  project             = var.project_id
  web_backend_service = google_compute_backend_service.internal_app.name
  role                = "roles/iap.httpsResourceAccessor"

  members = [
    "group:engineering@company.com",
    "user:alice@company.com"
  ]
}
```

### Step 3: Application Trust and JWT Validation

While IAP handles the login flow, the backend application must still know *who* logged in (e.g., to render their specific user profile). When IAP forwards the request to the backend, it injects a cryptographic JSON Web Token (JWT) into an HTTP header named `X-Goog-IAP-JWT-Assertion`.

**Critical Security Rule:** The backend application MUST NOT blindly trust that traffic came from IAP just because it is on the internal network. The application must programmatically validate the signature of the JWT using Google's public keys. If the JWT is missing or invalid, the backend must reject the request. This prevents malicious actors inside the network from bypassing IAP and hitting the backend directly.

Example Node.js JWT validation concept:
```javascript
const {OAuth2Client} = require('google-auth-library');
const expectedAudience = `/projects/12345/global/backendServices/67890`;

async function verifyIapToken(jwtToken) {
  const oAuth2Client = new OAuth2Client();
  const ticket = await oAuth2Client.verifyIapToken({
    idToken: jwtToken,
    expectedAudience: expectedAudience,
  });
  const payload = ticket.getPayload();
  return payload.email; // The verified email of the user
}
```

## Conclusion

GCP Identity-Aware Proxy operationalizes the Zero Trust model for web applications. By shifting access control from network perimeters to identity and context-based evaluation at the load balancer, organizations can deprecate cumbersome VPNs. IAP provides a seamless user experience, reduces operational overhead, and massively reduces the blast radius of potential compromises, ensuring that internal tools remain secure even when accessed over the public internet.