# Least Privilege Explained Through a Real Breach: Preventing Blast Radiuses

## The Problem: Over-Provisioning by Default
In fast-paced engineering environments, resolving "Access Denied" errors is seen as friction. When a developer's script fails to read from an S3 bucket, the quickest fix is often to attach an `AmazonS3FullAccess` policy to the script's IAM role. 

This approach—granting broad permissions to solve a narrow problem—is the root cause of the most devastating cloud breaches in history. When an attacker compromises a system, they inherit the privileges of that system. If the system is over-provisioned, the attacker's "blast radius" (the amount of damage they can do) is catastrophic.

The Principle of Least Privilege (PoLP) dictates that a user, program, or process should have only the bare minimum privileges necessary to perform its intended function, and nothing more.

## Anatomy of a Breach: The Capital One Hack
To understand why Least Privilege is critical, we must study what happens when it is ignored. In 2019, Capital One suffered a massive data breach affecting 100 million customers. The mechanics of the breach perfectly illustrate the danger of over-provisioned roles.

### Step 1: The Initial Compromise (The Vector)
Capital One deployed a Web Application Firewall (WAF) on an EC2 instance in AWS. The WAF software contained a vulnerability known as Server-Side Request Forgery (SSRF). 

An attacker exploited this SSRF vulnerability. By sending a specially crafted HTTP request to the WAF, the attacker tricked the WAF server into making an outbound HTTP request on the attacker's behalf.

### Step 2: The Metadata Service (The Pivot)
In AWS, every EC2 instance can query a local, unauthenticated endpoint (the Instance Metadata Service, or IMDS, at `169.254.169.254`) to retrieve information about itself, including the temporary IAM credentials assigned to that specific instance.

The attacker used the SSRF vulnerability to make the WAF query the IMDS and return the IAM credentials.

```text
[ Attacker ] --(SSRF Payload)--> [ WAF (EC2) ] --(Query)--> [ AWS IMDS (169.254.169.254) ]
                                      |
                                      <--(Returns IAM Credentials)--
```

### Step 3: The Blast Radius (The Failure of Least Privilege)
The attacker now held the IAM credentials assigned to the WAF instance. 

What permissions *should* a WAF have? A WAF needs to read incoming traffic, perhaps write logs to CloudWatch, and maybe read configuration files from a specific, isolated S3 bucket.

What permissions *did* the WAF have? The IAM role assigned to the WAF (named `WAF-Role`) was wildly over-provisioned. It had permission to list all S3 buckets in the account and read the contents of almost any bucket, including buckets containing millions of credit card applications.

Because the role lacked Least Privilege, the initial compromise of a single web server turned into a catastrophic data exfiltration event. The attacker used the stolen credentials to run `aws s3 sync` and download 30GB of highly sensitive data.

## Engineering Least Privilege

How do we architect systems to prevent this? We scope permissions tightly across three dimensions: Identity, Action, and Resource.

### Anti-Pattern: The Wildcard Policy
This is the equivalent of what caused the Capital One breach.

```json
// TERRIBLE: Grants the ability to do anything to any S3 bucket.
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": "s3:*",
      "Resource": "*"
    }
  ]
}
```

### The Least Privilege Pattern
If a microservice needs to read configuration files from a specific bucket, the policy must reflect exactly that and nothing else.

```json
// EXCELLENT: Scoped by Action and exact Resource ARN.
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:GetObject" 
      ],
      "Resource": "arn:aws:s3:::company-waf-config-prod-us-east-1/*"
    }
  ]
}
```
If an attacker compromises a server with this policy, their blast radius is limited to reading the WAF configuration files. They cannot list other buckets, they cannot write data, and they cannot access customer records.

## Practical Implementation Rules

1.  **Never Use Wildcards (`*`):** Explicitly name the actions (`s3:PutObject`, not `s3:*`) and explicitly name the resources (the exact bucket ARN, not `*`).
2.  **Separate Roles per Service:** Do not share IAM roles between different microservices. If `Service A` needs database access and `Service B` needs S3 access, create two distinct roles. Sharing roles expands the blast radius if either service is compromised.
3.  **Just-In-Time (JIT) Access:** For human operators, privileges should not be permanent. Engineers should request elevated access (e.g., to a production database) via an automated system that grants the access for exactly 2 hours and then revokes it.
4.  **Continuous Auditing:** Use tools like AWS IAM Access Analyzer or GCP Policy Intelligence to automatically flag roles that have permissions they haven't used in the last 30 days. Strip those unused permissions away.

## Conclusion
Assume your application will be breached. A vulnerability in a dependency or a zero-day in a framework is eventually inevitable. The Principle of Least Privilege is the architectural firewall that ensures a minor initial compromise does not escalate into a company-ending data breach. Constrain the blast radius.