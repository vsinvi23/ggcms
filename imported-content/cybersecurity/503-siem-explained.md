# SIEM Explained from Scratch: Aggregation, Correlation, and Alerting

## The Problem: Siloed Visibility
An attacker phishes a user (Email Gateway logs), VPNs into the network (VPN Firewall logs), downloads a payload (Web Proxy logs), and creates a local admin account (Endpoint logs). 

Viewed in isolation, none of these events might trigger a high-severity alarm. Phishing attempts happen daily. VPN logins are normal. Downloading executables is common. Creating local admins happens during maintenance. 

Security Information and Event Management (SIEM) systems exist to eliminate these silos, providing a centralized brain that correlates disparate events into a single, cohesive attack narrative.

## SIEM Architecture

```text
[Endpoints]   [Firewalls]   [Cloud Configs]   [Identity (AD/Okta)]
     |             |               |                  |
     +-------------+-------+-------+------------------+
                           |
                     [Log Forwarders] (Logstash, Fluentd, Promtail)
                           |
                    [Message Queue] (Kafka, Redis)
                           |
                      [SIEM Core] 
            (Elasticsearch, Splunk, Sentinel)
             /             |             \
      [Storage]      [Correlation]     [Dashboards & Alerts]
```

## The Three Pillars of SIEM

### 1. Aggregation and Normalization
The SIEM collects logs from every device. However, raw logs are chaotic. The SIEM parses and normalizes the data into a common format. 
For example, normalizing `src_ip`, `SourceAddress`, and `ip_src` into a single, queryable field: `source.ip`.

### 2. Correlation Engine
This is the true power of a SIEM. It applies logic across the normalized data, looking for patterns over time.

**Sigma Rule Example (Standardized SIEM querying):**
```yaml
title: Potential Lateral Movement via WMI
description: Detects WMI execution to remote machines.
logsource:
  product: windows
  service: security
detection:
  selection:
    EventID: 4688
    ProcessName|endswith: '\wmic.exe'
    CommandLine|contains: '/node:'
  condition: selection
```

A robust correlation engine doesn't just match strings; it builds state.
*Rule: Alert if `Failed_Logins > 5` AND `Successful_Login = 1` within `5 minutes` from the same `source.ip`.*

### 3. Alerting and Triage
When a correlation rule matches, the SIEM generates an alert and routes it to the Security Operations Center (SOC). 
High-quality SIEMs enrich the alert before presenting it. Instead of just showing the IP, the SIEM queries Threat Intelligence feeds (like VirusTotal) and attaches the IP's reputation score directly to the ticket.

## SIEM Pitfalls
- **Garbage In, Garbage Out:** Ingesting DNS debug logs without a use case will bankrupt you in licensing costs and destroy query performance.
- **Rule Rot:** Network topologies change. If correlation rules aren't actively tuned, the SOC will drown in false positives, leading to critical alerts being ignored.
