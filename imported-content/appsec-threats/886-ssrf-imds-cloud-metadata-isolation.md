# Server-Side Request Forgery: Preventing Cloud Metadata Extraction

## The Problem: The Blind Spot of SSRF

Server-Side Request Forgery (SSRF) occurs when a web application accepts a user-provided URL and fetches it from the server's backend. Attackers exploit this to bypass firewalls, scanning internal networks and interacting with internal APIs (e.g., `http://localhost:8080/admin`).

In modern cloud environments (AWS, GCP, Azure), SSRF is catastrophic due to the **Instance Metadata Service (IMDS)**. Every cloud compute instance hosts a non-routable metadata endpoint (typically `169.254.169.254`). If an attacker forces an EC2 instance to query this IP, they can extract the instance's attached IAM role credentials (Access Key, Secret Key, and Session Token), resulting in immediate, total infrastructure compromise.

## The Mechanics: IMDSv1 vs IMDSv2

Historically, AWS IMDSv1 allowed standard `GET` requests. A simple SSRF payload could instantly retrieve IAM keys:

`GET http://169.254.169.254/latest/meta-data/iam/security-credentials/WebServerRole`

To mitigate this, AWS introduced **IMDSv2**. IMDSv2 requires a session-oriented request. The caller must first execute a `PUT` request with a specific header (`X-aws-ec2-metadata-token-ttl-seconds`) to receive a token, and then include that token via an `X-aws-ec2-metadata-token` header in subsequent `GET` requests. 

Because standard SSRF vulnerabilities rarely allow attackers to control both the HTTP method (`PUT`) *and* inject custom headers simultaneously, enforcing IMDSv2 neutralizes the vast majority of SSRF-to-metadata attacks.

### ASCII Architecture: SSRF Attack Flow (IMDSv1)

```text
[ Attacker ]
      | (1) POST /webhook?url=http://169.254.169.254/latest/meta-data/...
      v
[ Web Server (EC2) ] ---(2) GET 169.254.169.254 ---> [ AWS IMDS Endpoint ]
      |                                                    |
      | <---(3) Returns AWS_ACCESS_KEY_ID & Token ---------+
      v
[ Attacker ] (4) Attacker uses keys locally via AWS CLI to dump databases
```

## Implementation: Defense in Depth

Securing applications against SSRF requires a two-pronged approach: Infrastructure Hardening and Application-Level Egress Filtering.

### 1. Infrastructure Hardening: Enforcing IMDSv2 via Terraform

You must explicitly disable IMDSv1 across your entire fleet. If a single instance supports IMDSv1, it is a critical vulnerability waiting to happen.

```hcl
resource "aws_instance" "app_server" {
  ami           = "ami-0c55b159cbfafe1f0"
  instance_type = "t3.micro"
  iam_instance_profile = aws_iam_instance_profile.app_profile.name

  # CRITICAL: Require IMDSv2 and disable IMDSv1
  metadata_options {
    http_endpoint               = "enabled"
    http_tokens                 = "required" # Enforces IMDSv2
    http_put_response_hop_limit = 1          # Prevents routing tokens through proxies
  }
}
```

*Note: The `http_put_response_hop_limit = 1` ensures that the token cannot travel beyond the instance itself, preventing exploitation via containerized network bridges if the app runs in Docker without host networking.*

### 2. Application Level: Network Egress Filtering

Do not rely solely on blocklisting `169.254.169.254` in your application code. Attackers bypass regex filters using IP obfuscation (e.g., `http://2852039166`, `http://0xA9FEA9FE`, or via DNS rebinding where `attacker.com` resolves to `169.254.169.254`).

Instead, use a strictly configured HTTP client that resolves the DNS record *first*, checks the resulting IP against a deny-list of private CIDR ranges, and only then initiates the connection.

**Robust Code: Go SSRF-Safe HTTP Client**

```go
package security

import (
	"errors"
	"net"
	"net/http"
	"time"
)

// Define private/local CIDR blocks that must never be accessed via SSRF
var privateCIDRs = []string{
	"127.0.0.0/8",       // Localhost
	"10.0.0.0/8",        // RFC1918
	"172.16.0.0/12",     // RFC1918
	"192.168.0.0/16",    // RFC1918
	"169.254.169.254/32",// AWS/GCP Metadata
	"::1/128",           // IPv6 Localhost
}

var parsedCIDRs []*net.IPNet

func init() {
	for _, cidr := range privateCIDRs {
		_, block, _ := net.ParseCIDR(cidr)
		parsedCIDRs = append(parsedCIDRs, block)
	}
}

// Create a custom HTTP client that intercepts DNS resolution
func GetSSRFSafeClient() *http.Client {
	safeTransport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			// 1. Resolve IP manually
			ips, err := net.LookupIP(host)
			if err != nil {
				return nil, err
			}

			// 2. Validate IP is not internal/metadata
			for _, ip := range ips {
				for _, block := range parsedCIDRs {
					if block.Contains(ip) {
						return nil, errors.New("SSRF Blocked: Attempt to access internal IP")
					}
				}
			}

			// 3. Proceed with connection to the resolved, validated IP
			dialer := &net.Dialer{Timeout: 5 * time.Second}
			return dialer.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
		},
	}

	return &http.Client{
		Transport: safeTransport,
		Timeout:   10 * time.Second,
	}
}
```

## Conclusion

SSRF in the cloud is an infrastructure-ending vulnerability if IMDS is left unprotected. By enforcing IMDSv2 at the infrastructure layer (Terraform) and implementing DNS-aware, post-resolution egress filtering in your application's HTTP clients, you create a robust, defense-in-depth architecture that neutralizes SSRF exploration attempts.
