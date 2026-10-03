---
title: "Auditing SAML RelayState to Prevent Open Redirect Attacks"
description: "Why blindly trusting the SAML RelayState parameter creates an open redirect vulnerability in SSO flows, and how to fix it with opaque session references or strict hostname allowlisting in Python and Java."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "saml"
  - "relaystate"
  - "open-redirect"
  - "sso"
  - "phishing"
  - "session-security"
---

# Auditing SAML RelayState to Prevent Open Redirect Attacks

## The Problem: The "Where Was I?" Dilemma in SSO

In an enterprise SAML 2.0 SSO flow, authentication bounces the user between two domains: the Service Provider (SP, the application the user wants) and the Identity Provider (IdP, e.g. Okta, Ping).

When a user requests a specific deep link (e.g. `https://crm.company.com/reports/Q3-sales`), the SP intercepts the unauthenticated request and redirects to the IdP. After successful authentication, the IdP sends the user back to the SP's Assertion Consumer Service (ACS) URL (e.g. `https://crm.company.com/saml/acs`).

**The dilemma**: how does the SP remember to send the user to `/reports/Q3-sales` instead of dumping them on the homepage? The SAML specification solves this with the `RelayState` parameter — the SP sends it to the IdP, and the IdP echoes it back untouched alongside the SAML assertion.

```
User                          Service Provider (CRM)              Identity Provider (Okta)
 |                                    |                                     |
 | 1. GET /reports/Q3-sales           |                                     |
 |----------------------------------->|                                     |
 |                                    | 2. Redirect to IdP                  |
 |                                    |    (SAMLRequest + RelayState=        |
 |                                    |     "/reports/Q3-sales")             |
 |------------------------------------------------------------------------->|
 |                                    |                                     | 3. Authenticate user
 |                                    | 4. POST /saml/acs                   |
 |                                    |    (SAMLResponse + RelayState=       |
 |                                    |     "/reports/Q3-sales")             |
 |<-------------------------------------------------------------------------|
 |                                    | 5. Validate SAMLResponse             |
 | 6. Redirect to RelayState          |                                     |
 |    (/reports/Q3-sales)             |                                     |
 |<-----------------------------------|                                     |
```

**The vulnerability**: if the SP blindly trusts the `RelayState` value returned by the IdP and issues an HTTP 302 to whatever it contains, it creates a critical **open redirect** vulnerability.

## The Mental Model: The Unverified Taxi Driver

Think of `RelayState` as a sticky note handed to a taxi driver (the IdP): "Take this person to Building 4." The driver first takes the passenger to headquarters to get their security badge, then returns them and hands back the note.

An open redirect happens when an attacker swaps the note. They craft a link to your SP's login endpoint with their own `RelayState`: `https://crm.company.com/login?RelayState=https://evil-phishing.com/login`. The SP blindly forwards that value to the IdP, gets it echoed back, validates the user's identity — and then redirects the freshly authenticated user straight to the attacker's domain. Because the user just authenticated with the legitimate SP, they implicitly trust whatever page appears next, making them highly susceptible to credential harvesting.

## Implementation Deep Dive: Securing RelayState

### 1. The Ideal Defense: Opaque References

The most secure approach never passes an actual URL in `RelayState`. Treat it as an opaque key, exactly like an OAuth `state` parameter:

1. When the user requests `/reports/Q3`, the SP generates a random ID (e.g. `req-8f72a`).
2. The SP stores the mapping `req-8f72a -> /reports/Q3` in the user's session or a distributed cache (Redis).
3. The SP sends `RelayState=req-8f72a` to the IdP.
4. When the IdP returns `req-8f72a`, the SP looks it up in the cache.
5. If found, redirect to the cached URL. If not found, redirect to a safe default.

```python
# Secure SP implementation using Opaque References
def initiate_sso(request):
    target_url = request.path
    opaque_id = generate_secure_uuid()

    # Store in session (server-side)
    request.session['relay_state_map'] = {opaque_id: target_url}

    redirect_to_idp(relay_state=opaque_id)

def handle_acs(request):
    # ... validate SAML response ...

    returned_relay_state = request.POST.get('RelayState')
    mapped_url = request.session.get('relay_state_map', {}).get(returned_relay_state)

    if mapped_url:
        return HttpResponseRedirect(mapped_url)
    else:
        return HttpResponseRedirect('/dashboard')  # Safe default fallback
```

### 2. The Acceptable Defense: Strict URL Validation (Allowlisting)

If architectural constraints require passing actual URLs in `RelayState`, aggressively validate the URL upon return. **Never use regex for URL validation** — URL parsing is notoriously complex and easy to bypass (e.g. `https://trusted.com.evil.com` or `https://trusted.com\@evil.com`). Use the language's built-in URL parser to extract the hostname and check it against a strict allowlist.

```java
// Acceptable SP implementation using URL Validation (Java)
public void handleSAMLResponse(HttpServletRequest request, HttpServletResponse response) {
    String relayState = request.getParameter("RelayState");
    String safeRedirectUrl = "/default-home";

    if (relayState != null && !relayState.isEmpty()) {
        try {
            URI uri = new URI(relayState);

            // 1. Force Relative Paths (Safest URL-based approach)
            if (!uri.isAbsolute() && relayState.startsWith("/")) {
                safeRedirectUrl = relayState;
            }
            // 2. OR Strict Hostname Allowlist (If absolute URLs are required)
            else if ("crm.company.com".equals(uri.getHost()) || "api.company.com".equals(uri.getHost())) {
                safeRedirectUrl = relayState;
            } else {
                 log.warn("Blocked Open Redirect attempt via RelayState: " + relayState);
            }
        } catch (URISyntaxException e) {
            log.error("Malformed RelayState parameter", e);
        }
    }

    response.sendRedirect(safeRedirectUrl);
}
```

By ensuring `RelayState` is either an opaque session reference or a strictly parsed and validated local path/hostname, security teams eliminate the risk of SSO infrastructure being weaponized for phishing campaigns.
