# SSL Stripping and Downgrade Attacks: How HSTS Fixes the Flaw

**Problem:** Cryptographic protocols are useless if an attacker can intercept the initial HTTP request and prevent the transition to HTTPS entirely, leaving the connection in plaintext. 

### The Anatomy of an SSL Stripping Attack

SSL Stripping (famously demonstrated by Moxie Marlinspike's `sslstrip` tool) is a devastating Man-in-the-Middle (MitM) attack that targets the user's initial interaction with a web application.

Most users do not type `https://bank.com` into their browser; they type `bank.com`. The browser defaults to sending an unencrypted HTTP request on port 80. The server typically responds with a `301 Moved Permanently` redirect to the HTTPS version.

**The Attack Execution:**
1. **Interception:** The MitM attacker intercepts the initial plaintext HTTP request from the victim to `http://bank.com`.
2. **Proxying:** The attacker forwards a secure HTTPS request to the real server (`https://bank.com`).
3. **Stripping:** The server responds over HTTPS. The attacker receives this secure response, strips away the HTTPS formatting, rewrites all `https://` links in the HTML payload to `http://`, and sends the plaintext HTTP back to the victim.

```text
Victim                Attacker (MitM)               Server
------                ---------------               ------
HTTP GET bank.com  --> 
                       HTTPS GET bank.com   ------> 
                       <------------------- HTTPS Response (HTML)
<-- HTTP Response (HTML w/ stripped links)
```

The victim sees the website normally, but their browser is communicating entirely in plaintext with the attacker, who is acting as a translating proxy. Passwords and session cookies are captured instantly.

### HTTP Strict Transport Security (HSTS)

To defeat SSL stripping, the browser needs a mechanism to *know* that a domain must only be accessed over HTTPS, eliminating the initial plaintext HTTP request entirely.

This is achieved via the `Strict-Transport-Security` (HSTS) HTTP response header.

**HSTS Header Syntax:**
`Strict-Transport-Security: max-age=31536000; includeSubDomains; preload`

When a browser receives this header over a valid, authenticated HTTPS connection, it memorizes the directive for the duration of the `max-age` (e.g., 1 year in seconds). 

#### How HSTS Neutralizes the Attack
Once HSTS is active for a domain, if a user types `bank.com`, the browser intercepts its own request internally. It upgrades the request to HTTPS *before* any network packet leaves the machine.

```text
Victim Browser (Internal)
-------------------------
User types: bank.com
Browser checks HSTS cache -> Match found!
Browser strictly enforces HTTPS on Port 443.
```

If the attacker attempts to intercept the resulting HTTPS connection (by providing a forged certificate), the browser will display a hard, non-bypassable warning to the user. Standard certificate warnings can often be clicked through by users, but HSTS explicitly forbids the browser from offering a "continue anyway" button.

### The Bootstrap Problem and HSTS Preloading

HSTS has a "Trust on First Use" (TOFU) vulnerability. The very first time a user visits the site, they haven't received the HSTS header yet, leaving them vulnerable to a momentary SSL stripping attack.

**The Solution: HSTS Preloading**
To eliminate the TOFU window, domain owners can submit their domain to the HSTS Preload List (maintained by Google and hardcoded into Chrome, Firefox, Safari, and Edge source code). 

By adding the `preload` directive to the header and registering the domain, browsers ship with intrinsic knowledge that the site is HTTPS-only. The initial vulnerable HTTP request is eradicated globally for all users.

```javascript
// Express.js HSTS Implementation Example
app.use((req, res, next) => {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  next();
});
```
HSTS transforms HTTPS from a reactive server-side redirect into a proactive, browser-enforced security mandate.