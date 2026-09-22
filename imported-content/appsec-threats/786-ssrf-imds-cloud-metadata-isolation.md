# Server-Side Request Forgery (SSRF): Preventing Cloud Metadata Extraction

## The Problem

Server-Side Request Forgery (SSRF) occurs when an application receives a user-supplied URL (e.g., for fetching a profile image, downloading an external RSS feed, or generating a PDF invoice) and makes an outbound backend network request to that URL without validating its target destination.

In cloud environments (AWS, Google Cloud, Azure), the stakes for SSRF are extremely high due to the presence of the **Instance Metadata Service (IMDS)**, accessible via the local IP `169.254.169.254`. Under IMDSv1, an attacker supplying a URL like `http://169.254.169.254/latest/meta-data/iam/security-credentials/` can retrieve full AWS IAM temporary credentials, completely hijacking the microservice's role.

Naive defenses attempt to block metadata extraction using regular expression matches or simple blacklists (e.g., checking if the host is `127.0.0.1` or `169.254.169.254`). Attackers trivially bypass these via **DNS Rebinding**:
1. The attacker registers a domain (e.g., `ssrf.attacker.com`) and configures a DNS server to return a short TTL (Time to Live = 0).
2. During the application's verification phase, the DNS resolves to a safe public IP (e.g., `8.8.8.8`).
3. Instantly after verification, the DNS server switches its answer to return `169.254.169.254`. When the application performs the actual socket fetch (Time-of-Check to Time-of-Use window), it connects directly to the internal metadata service.

---

## SSRF Mitigation Lifecycle

To secure outbound requests, the application must perform **Pre-flight DNS Resolution Validation** and resolve the target domain to a set of static IPs, verify they do not fall within private CIDR blocks, and then initiate the network connection explicitly using the resolved IP addresses, bypassing standard system DNS lookups during the fetch itself.

### DNS Rebinding Defense Architecture
```
[ Incoming Request URL ]
          │
          ▼
   1. Extract Domain -> Resolve DNS (Pre-flight lookup)
          │
          ▼
   2. Verify Resolved IPs are NOT Link-Local, Localhost, or RFC 1918 Private ranges
      - Link-Local: 169.254.0.0/16
      - Localhost: 127.0.0.0/8, ::1
      - RFC 1918: 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16
          │
          ▼
   3. Initiate connection DIRECTLY to Verified IP (Prevents secondary lookup / rebinding!)
```

---

## Robust Secure HTTP Client Implementation

Below is a production-ready Python client implementing strict DNS pre-flight verification, IP range filtering, and DNS-pinning patterns to prevent SSRF and DNS Rebinding.

```python
import socket
import urllib.parse
import ipaddress
import requests
from typing import Optional

class SecureHttpClient:
    # Strict forbidden destination ranges
    FORBIDDEN_NETWORKS = [
        ipaddress.ip_network('127.0.0.0/8'),      # Loopback
        ipaddress.ip_network('169.254.0.0/16'),  # AWS/Cloud Link-Local Metadata
        ipaddress.ip_network('10.0.0.0/8'),      # RFC 1918 Private Class A
        ipaddress.ip_network('172.16.0.0/12'),   # RFC 1918 Private Class B
        ipaddress.ip_network('192.168.0.0/16'),  # RFC 1918 Private Class C
        ipaddress.ip_network('0.0.0.0/8'),       # Local broadcast
        ipaddress.ip_network('::1/128'),         # IPv6 Loopback
        ipaddress.ip_network('fe80::/10'),       # IPv6 Link-Local
        ipaddress.ip_network('fc00::/7')         # IPv6 Unique Local
    ]

    @classmethod
    def _is_safe_ip(cls, ip_str: str) -> bool:
        """
        Verifies if an IP falls within standard public-facing addresses.
        """
        try:
            ip = ipaddress.ip_address(ip_str)
            for network in cls.FORBIDDEN_NETWORKS:
                if ip in network:
                    return False
            return True
        except ValueError:
            return False

    @classmethod
    def safe_get(cls, target_url: str, timeout: int = 5) -> Optional[requests.Response]:
        """
        Executes a safe GET request. Resolves DNS, checks safe IP ranges, 
        and pins the connection to the validated IP to defeat DNS Rebinding.
        """
        parsed = urllib.parse.urlparse(target_url)
        if parsed.scheme not in ('http', 'https'):
            raise ValueError("Forbidden URI scheme. Only http/https are allowed.")

        host = parsed.hostname
        if not host:
            raise ValueError("Malformed URL target.")

        # 1. Resolve host DNS
        try:
            resolved_ips = socket.getaddrinfo(host, parsed.port or (80 if parsed.scheme == 'http' else 443))
        except socket.gaierror:
            return None

        # Gather IP addresses from resolution
        ips_to_check = [info[4][0] for info in resolved_ips]

        if not ips_to_check:
            raise SecurityError("DNS Resolution returned empty result.")

        # 2. Audit resolved IP addresses
        for ip in ips_to_check:
            if not cls._is_safe_ip(ip):
                raise SecurityError(f"Access Denied: Resolved target address {ip} is flagged as unsafe.")

        # Pick the first validated IP
        pinned_ip = ips_to_check[0]

        # 3. Pin requests to resolved IP to prevent secondary lookup (DNS Rebinding TOCTOU)
        # We rewrite the URL to point directly to the IP and set the original host header manually
        pinned_url = parsed._replace(netloc=f"{pinned_ip}:{parsed.port}" if parsed.port else pinned_ip).geturl()
        
        headers = {"Host": host}
        
        # Disable SSL verification issues when connecting directly to IP if using HTTPS
        # Note: If strict HTTPS validation is required, use custom Adapter that maps the hostname
        # in the SSL handshake while connecting to the target IP.
        response = requests.get(pinned_url, headers=headers, timeout=timeout, allow_redirects=False)
        return response

class SecurityError(Exception):
    pass
```

---

## Architectural Mitigation & Best Practices

1. **Enforce AWS IMDSv2**: Migrating cloud infrastructure to IMDSv2 defeats simple SSRF. IMDSv2 requires a session-oriented flow where clients must issue a `PUT` request with a header `X-aws-ec2-metadata-token-ttl-seconds` to get a temporary session token before reading metadata. Naive SSRF payloads can rarely perform complex HTTP PUT calls with custom headers.
2. **Egress Network Boundaries**: Segment your backend subnets. Application containers that process file imports or external fetches should run in isolated subnets with egress rules (Security Groups) strictly blocking outbound access to any IP on port `80/443` except explicit allowlisted API integrations.
