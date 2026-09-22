# OAuth 2.0 mTLS: Binding Access Tokens to Client Certificates (RFC 8705)

## The Problem: The Inherent Vulnerability of Standard Bearer Tokens

The majority of OAuth 2.0 deployments rely on basic Bearer Tokens. A bearer token is structurally identical to cash: whoever holds the token can spend it. If an attacker exfiltrates a bearer token via Cross-Site Scripting (XSS), intercepts it on an unencrypted communication channel, or harvests it from server-side application logs, they can immediately access protected resources.

Standard access tokens have no cryptographic binding to the client that requested them. Once stolen, standard token signatures remain valid, and the resource server (RS) cannot distinguish between the legitimate client and an attacker.

To eliminate this vulnerability, **RFC 8705 (Mutual TLS Client Certificate-Bound Access Tokens)** introduces a cryptographic binding between the access token and the client's TLS cryptographic identity. A stolen token is completely useless to an attacker unless they also possess the client's private key.

---

## Technical Architecture

The following diagram illustrates how the Client, Reverse Proxy (terminating mTLS), and Resource Server (RS) coordinate to validate certificate-bound access tokens:

```
+--------+                      1. mTLS Handshake & Request                      +-----------------+
| Client | --------------------------------------------------------------------> |  Reverse Proxy  |
+--------+            - Client Certificate is presented                          |  (mTLS Term)    |
    |                 - Request includes Certificate-bound Access Token          +-----------------+
    |                                                                                     |
    |                                                                                     | 2. Extract Client Cert Hash
    |                                                                                     |    Forward via custom header
    |                                                                                     |    (e.g., X-SSL-Client-SHA256)
    |                                                                                     v
    |                                                                            +-----------------+
    |                                                                            | Resource Server |
    |                                                                            | (Microservice)  |
    |                                                                            +-----------------+
    |                                                                                     |
    |                     3. Cryptographic Validation Checks                              |
    |                        - Decodes Token's "cnf" claim                                |
    |                        - Compares "cnf.x5t#S256" against forwarded header hash      |
    +=====================================================================================+
```

---

## Technical Deep Dive: The Confirmation (`cnf`) Claim

When a client requests a token via mTLS, the Authorization Server (AS) extracts the client's public certificate, calculates its SHA-256 fingerprint, and embeds it inside the JWT payload under the Confirmation claim:

```json
{
  "iss": "https://auth.serenya.io",
  "sub": "service-client-01",
  "aud": "https://api.serenya.io",
  "exp": 1812345600,
  "cnf": {
    "x5t#S256": "u-Z_E-uE_N_gYI4Z7gO4zW-9BAs8vI9E_mUqY"
  }
}
```

The resource server must extract this hash and match it to the fingerprint of the client certificate used to establish the mTLS session. If they do not match, the request must be instantly rejected.

---

## Code Implementation: Python (Flask)

The following example implements a production-grade validation filter for a Resource Server behind a reverse proxy (e.g., Nginx, Envoy) that forwards the client's certificate fingerprint in an HTTP header.

```python
import base64
import hashlib
import jwt
from flask import Flask, request, jsonify, g
from functools import wraps

app = Flask(__name__)

# Configured public key of the Authorization Server
AS_PUBLIC_KEY = """-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA0G...
-----END PUBLIC KEY-----"""

def mtls_token_required(f):
    """
    Middleware that enforces RFC 8705 token-to-certificate binding.
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization")
        if not auth_header or not auth_header.startswith("Bearer "):
            return jsonify({"error": "Missing or malformed Authorization header"}), 401

        token = auth_header.split(" ")[1]

        # 1. Retrieve the certificate hash forwarded securely by the TLS-terminating reverse proxy
        # Gateway must be configured to strip this header from external clients to prevent spoofing!
        forwarded_cert_hash = request.headers.get("X-SSL-Client-SHA256")
        if not forwarded_cert_hash:
            return jsonify({"error": "Mutual TLS client certificate fingerprint missing"}), 401

        try:
            # 2. Decode and cryptographically verify the JWT signature
            payload = jwt.decode(
                token, 
                AS_PUBLIC_KEY, 
                algorithms=["RS256"], 
                audience="https://api.serenya.io"
            )
            
            # 3. Extract the confirmation (cnf) claim containing the certificate binding
            cnf = payload.get("cnf")
            if not cnf or "x5t#S256" not in cnf:
                return jsonify({"error": "Token is not bound to a client certificate (missing cnf)"}), 403

            token_cert_fingerprint = cnf["x5t#S256"]

            # 4. Standardize and compare both thumbprints
            # Clean forwarded hash from proxy (converts hex representations to raw bytes, then Base64URL)
            raw_cert_bytes = bytes.fromhex(forwarded_cert_hash.replace(":", ""))
            calculated_b64url = base64.urlsafe_b64encode(raw_cert_bytes).decode("utf-8").rstrip("=")

            if calculated_b64url != token_cert_fingerprint:
                # Fingerprint mismatch: Token was replayed by a different client!
                return jsonify({
                    "error": "Access Denied: Client certificate does not match the bound token."
                }), 403

            # Token and certificate match, store payload context
            g.token_payload = payload
            return f(*args, **kwargs)

        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token has expired"}), 401
        except jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token signature or structure"}), 401
        except ValueError:
            return jsonify({"error": "Malformed certificate signature header"}), 400

    return decorated

@app.route("/secure-data", methods=["GET"])
@mtls_token_required
def secure_data():
    return jsonify({
        "status": "Success",
        "client_id": g.token_payload.get("sub"),
        "message": "Cryptographic binding verified. Token cannot be replayed."
    })
```

---

## Operational Verification

To verify mTLS token binding:
- Set up a proxy that terminates mTLS and forwards the certificate fingerprint.
- Attempt to make a request using a valid bound token from a client presenting a *different* client certificate. The server must block the request with a `403 Forbidden` response.
- Confirm that normal clients presenting the correct certificate are verified and authorized seamlessly.
