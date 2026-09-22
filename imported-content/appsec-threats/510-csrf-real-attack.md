# CSRF Explained: Forging State-Changing Requests

## The Problem: The Confused Deputy
Cross-Site Request Forgery (CSRF) is an attack that forces an end user to execute unwanted actions on a web application in which they are currently authenticated. 

Browsers automatically include session cookies with cross-origin requests. If you are logged into your bank, and you visit a malicious website, the malicious website can send a request to your bank. Your browser will attach your bank session cookie to that request, and the bank will process it as if you initiated it.

## The Attack Scenario

Let's assume `bank.com` uses a simple `POST` request to transfer money.

```http
POST /api/transfer HTTP/1.1
Host: bank.com
Cookie: session_id=valid_user_session

amount=1000&to_account=hacker_account
```

### The Exploit
The attacker creates a malicious website, `evil.com`. They trick the victim into visiting it (e.g., via a phishing email).

The HTML on `evil.com` contains a hidden form:

```html
<!-- Hosted on evil.com -->
<html>
  <body>
    <h1>You won a prize!</h1>
    <form action="https://bank.com/api/transfer" method="POST" id="csrf_form">
      <input type="hidden" name="amount" value="1000" />
      <input type="hidden" name="to_account" value="hacker_account" />
    </form>
    <script>
      // Automatically submit the form as soon as the page loads
      document.getElementById('csrf_form').submit();
    </script>
  </body>
</html>
```

1. Victim logs into `bank.com`.
2. Victim visits `evil.com`.
3. `evil.com` automatically submits the POST request to `bank.com`.
4. The victim's browser dutifully attaches the `session_id` cookie for `bank.com`.
5. The bank processes the transfer.

## The Defense Architecture

### 1. Anti-CSRF Tokens (The Synchronizer Token Pattern)
The server generates a unique, cryptographically strong, and unpredictable token for the user's session. This token is embedded in all state-changing forms (POST, PUT, DELETE).

```html
<!-- Hosted on bank.com -->
<form action="/api/transfer" method="POST">
  <input type="hidden" name="csrf_token" value="abc123xyz789..." />
  <input type="text" name="amount" />
  <button type="submit">Transfer</button>
</form>
```

When the form is submitted, the server verifies that the `csrf_token` in the request body matches the token stored in the user's session.
Because the attacker on `evil.com` cannot read the victim's session data on `bank.com` (due to the Same-Origin Policy), they cannot guess the `csrf_token` to include in their forged request.

### 2. SameSite Cookie Attribute
Modern browsers support the `SameSite` attribute on cookies. This tells the browser whether or not to send the cookie with cross-site requests.

```http
Set-Cookie: session_id=valid_user_session; SameSite=Lax; Secure; HttpOnly
```
- `SameSite=Strict`: The cookie is only sent if the request originates from the same site.
- `SameSite=Lax`: The cookie is sent on top-level navigations (like clicking a link), but not on POST requests initiated by third-party sites.

Using `SameSite=Lax` or `Strict` entirely neutralizes the classic CSRF attack vector for modern browsers.
