# Server-Side Request Forgery (SSRF): Preventing Cloud Metadata Extraction (IMDSv1/v2)

## The Problem: The Server as a Proxy

Modern applications frequently interact with external resources. Features like webhooks, PDF generation from URLs, or image fetching require the server to make outbound HTTP requests based on user input. 

Server-Side Request Forgery (SSRF) occurs when an attacker manipulates this functionality, coercing the backend server into making requests to unintended destinations. Instead of fetching a benign external image, the attacker forces the server to query internal networks, bypassing firewalls and Network Security Groups (NSGs).

In cloud environments (AWS, GCP, Azure), SSRF is catastrophic. Attackers target the Instance Metadata Service (IMDS)—a local REST API available at `169.254.169.254` that provides the virtual machine with its configuration data, including highly privileged, temporary IAM credentials. Extracting these credentials grants the attacker a foothold in the broader cloud environment.

## Architectural Flaw: Blind Execution of User URIs

Consider an endpoint designed to fetch an image and save it locally:

```python
# VULNERABLE SSRF ENDPOINT
import requests
from flask import FastAPI

app = FastAPI()

@app.get("/fetch_image")
def fetch_image(url: str):
    # The server blindly fetches whatever URL the user provides
    response = requests.get(url)
    return {"status": "success", "data": response.text}
```

If a user provides `url=http://example.com/image.png`, the app functions normally. 
If an attacker provides `url=http://169.254.169.254/latest/meta-data/iam/security-credentials/production-role`, the server queries the AWS IMDS.

```text
[ Attacker ] ---> (url=http://169.254.169.254/...) ---> [ EC2 Instance (App Server) ]
                                                               |
                                                               v
                                                    [ IMDS (169.254.169.254) ]
                                                               |
[ Attacker ] <--- (Returns AWS Secret Access Keys) <-----------+
```

With those keys, the attacker can use the AWS CLI from their own machine to access S3 buckets, spin up instances, or delete databases, entirely bypassing the web application's access controls.

## Defense in Depth: Eradicating SSRF

Preventing SSRF requires a combination of strict application-level input validation, network-level isolation, and critical cloud infrastructure hardening.

### 1. Cloud Hardening: Enforce IMDSv2

The original IMDS (v1) was a simple request-response API, making it trivial to exploit via basic SSRF. To combat this, AWS introduced IMDSv2, which requires session-oriented requests. 

IMDSv2 demands that a client first send a `PUT` request with a specific header (`X-aws-ec2-metadata-token-ttl-seconds`) to retrieve a token, and then use that token in subsequent `GET` requests. Because SSRF vulnerabilities almost never allow an attacker to send `PUT` requests *and* control custom HTTP headers simultaneously, IMDSv2 effectively neutralizes metadata extraction via SSRF.

**Terraform Implementation (Enforcing IMDSv2):**

```hcl
resource "aws_instance" "app_server" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"

  # Force IMDSv2. Requests without the token will be rejected.
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # Enforces v2
    http_put_response_hop_limit = 1          # Prevents routing via proxies
  }
}
```

*Note: GCP and Azure have similar mandatory header requirements (`Metadata-Flavor: Google` and `Metadata: true` respectively) that inherently protect against basic SSRF.*

### 2. Network Isolation: Egress Filtering

Do not rely solely on the application code to behave. Implement network-level boundaries. If your application only needs to fetch data from `api.stripe.com`, it should not be allowed to communicate with the rest of the internet, and certainly not the internal subnet (`10.0.0.0/8`, `192.168.0.0/16`).

Use AWS Security Groups, Kubernetes Network Policies, or firewall rules to explicitly deny outbound traffic to internal IP ranges and the metadata IP (`169.254.169.254`).

### 3. Application-Level Defenses: Strict Allowlisting

When validating user-provided URLs in code, blocklists (e.g., blocking `169.254.169.254` or `localhost`) are notoriously ineffective. Attackers bypass them using DNS rebinding, IPv6 encoding, octal IP representations, or URL shorteners.

**The Secure Approach:**
1.  **Parse the URL:** Use a robust URL parsing library.
2.  **Resolve the Hostname:** Resolve the hostname to an IP address *before* making the request.
3.  **Validate the IP:** Check the resolved IP against a strict allowlist or a definitive deny-list of private/internal ranges (RFC 1918).
4.  **Pin the Connection:** Make the HTTP request directly to the *resolved IP address* while passing the original hostname in the `Host` header. This prevents DNS Rebinding attacks where the DNS record changes between your validation check and the actual request.

**Python Example (Conceptual Validation):**

```python
import socket
import ipaddress
import urllib.parse

def is_safe_url(target_url):
    parsed = urllib.parse.urlparse(target_url)
    if parsed.scheme not in ['http', 'https']:
        return False

    try:
        # Resolve to IP
        ip = socket.gethostbyname(parsed.hostname)
        ip_obj = ipaddress.ip_address(ip)
        
        # Block all private, loopback, and reserved IPs
        if ip_obj.is_private or ip_obj.is_loopback or ip_obj.is_link_local:
            return False
            
        # Block the specific IMDS IP
        if str(ip_obj) == "169.254.169.254":
            return False
            
        return True
    except socket.gaierror:
        return False
```

## Conclusion

SSRF transforms a web application into a weaponized proxy. While application-level validation is necessary, the complexity of URL parsing and DNS rebinding makes it error-prone. The definitive defense relies on infrastructure hardening: enforcing IMDSv2 to protect cloud credentials, and strictly limiting the server's outbound network access (egress filtering) to only the specific external services required for business logic.
