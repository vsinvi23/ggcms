# Server-Side Request Forgery (SSRF): Preventing Cloud Metadata Extraction (IMDSv1/v2)

## The Problem: Arbitrary Internal Outbound Calls

Modern cloud-native web applications frequently need to request resources from external servers—such as fetching third-party profile pictures, processing webhooks, or parsing remote XML feeds. 

Server-Side Request Forgery (SSRF) occurs when an attacker manipulates a backend parameter to force the cloud instance to make an unauthorized HTTP request to an unintended destination. Because the backend server acts as a trusted entity inside the network, it can access resources that are not publicly exposed to the internet. The primary target in cloud environments (such as AWS, GCP, and Azure) is the Link-Local Instance Metadata Service (IMDS) located at the static IP address `169.254.169.254`. If an attacker can query IMDS, they can extract highly sensitive cloud environment variables, host metadata, and temporary IAM security credentials, leading to full cloud infrastructure compromise.

## Architectural Flaw: Lack of Network Isolation

The core architectural flaw is permitting application runtimes to execute arbitrary outbound network requests on the same network interface used to communicate with internal VPC resources and the link-local metadata address.

```text
SSRF Exploit Flow:
[ Attacker ] ---> POST /fetch?url=http://169.254.169.254/latest/meta-data/ ---> [ Vulnerable Web Server ]
                                                                                   |
                                                                                   | (Queries Local IP)
                                                                                   v
[ Temporary IAM Role Keys ] <--- [ Response Stream ] <--- [ IMDS Service (169.254.169.254) ]
```

When an application server performs outbound calls without resolving and verifying the target IP address against a strict blocklist of private and link-local ranges, it serves as an open network proxy for the attacker.

## Exploit Mechanics: IMDSv1 vs. IMDSv2

Cloud providers historically implemented IMDSv1, which relies on simple, stateless HTTP GET requests:

```bash
# IMDSv1 Direct Query - High Risk SSRF Target
curl http://169.254.169.254/latest/meta-data/iam/security-credentials/AppServerRole
```

Because this is a simple GET request with no custom headers, any basic SSRF vulnerability can read the response directly.

To combat this, cloud providers introduced **IMDSv2**, which introduces session-oriented defense. It requires a two-step handshake using a session token:

1.  **Generate a Token:** A HTTP `PUT` request with a custom header (`X-aws-ec2-metadata-token-ttl-seconds`) is sent to retrieve a temporary cryptographic token.
2.  **Request Metadata:** The token is sent in subsequent `GET` requests inside the `X-aws-ec2-metadata-token` header.

```bash
# IMDSv2 Secure Token Handshake
TOKEN=$(curl -X PUT "http://169.254.169.254/latest/api/token" -H "X-aws-ec2-metadata-token-ttl-seconds: 21600")
curl -H "X-aws-ec2-metadata-token: $TOKEN" http://169.254.169.254/latest/meta-data/
```

### Why IMDSv2 Blocks Most SSRF Attacks
Most basic SSRF vectors only allow an attacker to trigger HTTP `GET` requests; they cannot manipulate HTTP verbs to perform a `PUT` or inject arbitrary custom headers like `X-aws-ec2-metadata-token`. Additionally, IMDSv2 enforces a network hop limit (TTL) of `1` by default. If a containerized application (such as Docker or Kubernetes pod) is compromised, the request must hop from the container through the host's bridge interface. Since this constitutes 2 hops, the host kernel drops the metadata packet, preventing container-escape key extraction.

## Secure Implementation: Hardening the Outbound Pipe

Enforcing safety against SSRF demands resolving the requested URL's hostname to an IP address *before* establishing a TCP connection and validating it against a private network blocklist.

### DNS Rebinding Protection
A major vulnerability in naive validators is verifying the IP, then executing the request. In a "DNS Rebinding" attack, the attacker configures a DNS server that returns a safe IP (e.g., `8.8.8.8`) on the first query (during validation), but returns `169.254.169.254` on the second query (during the actual fetch). 

To prevent DNS Rebinding, the application must resolve the IP once, validate it, and perform the HTTP request directly to that resolved IP, while forcing the original Host header for SSL/TLS SNI verification.

Here is a secure implementation in Python:

```python
# secure_fetcher.py
import socket
import ipaddress
import urllib.parse
import requests

# Strict list of prohibited CIDR ranges (RFC 1918 + Link Local + Loopback)
PROHIBITED_RANGES = [
    ipaddress.ip_network('127.0.0.0/8'),       # Loopback
    ipaddress.ip_network('0.0.0.0/8'),         # Local identification
    ipaddress.ip_network('10.0.0.0/8'),        # Private class A
    ipaddress.ip_network('172.16.0.0/12'),     # Private class B
    ipaddress.ip_network('192.168.0.0/16'),    # Private class C
    ipaddress.ip_network('169.254.0.0/16'),    # Link-local (IMDS target)
    ipaddress.ip_network('224.0.0.0/4'),       # Multicast
    ipaddress.ip_network('::1/128'),           # IPv6 loopback
    ipaddress.ip_network('fe80::/10')          # IPv6 link-local
]

def validate_ip(ip_str: str) -> bool:
    """Verifies that the target IP does not belong to any prohibited network block."""
    try:
        ip = ipaddress.ip_address(ip_str)
        return not any(ip in net for net in PROHIBITED_RANGES)
    except ValueError:
        return False

def secure_http_get(user_url: str) -> str:
    """
    Safely executes an HTTP GET request to an untrusted URL,
    defending against standard SSRF and DNS Rebinding.
    """
    parsed_url = urllib.parse.urlparse(user_url)
    if parsed_url.scheme not in ['http', 'https']:
        raise ValueError("Invalid protocol scheme. Only HTTP and HTTPS are permitted.")

    hostname = parsed_url.hostname
    port = parsed_url.port or (443 if parsed_url.scheme == 'https' else 80)

    if not hostname:
        raise ValueError("Invalid target hostname.")

    # 1. Resolve DNS strictly ONCE to prevent DNS Rebinding
    try:
        resolved_ips = socket.getaddrinfo(hostname, port, proto=socket.IPPROTO_TCP)
        # Select the first resolved IP address
        target_ip = resolved_ips[0][4][0]
    except Exception as e:
        raise ValueError(f"DNS Resolution failed for {hostname}")

    # 2. Validate the resolved IP address
    if not validate_ip(target_ip):
        raise SecurityError(f"Access Denied: Target IP {target_ip} is in a prohibited range!")

    # 3. Perform HTTP request directly to the resolved IP
    # Force Host header so SSL validation and routing remain functional
    rewritten_url = f"{parsed_url.scheme}://{target_ip}:{port}{parsed_url.path}"
    if parsed_url.query:
        rewritten_url += f"?{parsed_url.query}"

    headers = {"Host": hostname}

    # Verify=True enforces SSL/TLS validity.
    # Note: Requests will raise an SSL error if certificate hostname validation fails against the IP.
    # To support HTTPS over resolved IPs securely, use a customized Session or HTTP Adapter.
    response = requests.get(rewritten_url, headers=headers, timeout=5, allow_redirects=False)
    
    return response.text

class SecurityError(Exception):
    pass
```

## Infrastructure Hardening

1.  **Enforce IMDSv2-Only:** Configure cloud launching templates to strictly disable IMDSv1 and limit metadata access tokens to a Hop Limit of 1.
2.  **Outbound Network Security Groups:** Implement firewalls or egress security groups blocking the application servers from speaking to `169.254.169.254` unless absolutely necessary.
3.  **Use an Outbound Proxy:** Force all outgoing HTTP traffic through a dedicated proxy (such as Squid) that handles domain filtering and IP verification at a centralized infrastructure gate.

## Conclusion

Server-Side Request Forgery exposes cloud architecture to credentials harvesting via the link-local metadata interface. While IMDSv2 raises the exploit bar by requiring stateful token handshake headers, robust application security requires strict, runtime-level DNS and IP validation. Resolving hostnames exactly once, comparing resulting IPs to private CIDR blocklists, and denying internal routing loopbacks completely eliminates the SSRF threat model at the application layer.
