# Security Logging and Monitoring: WORM Logs and Actionable Alerts

## The Problem: Data Rich, Information Poor
Most organizations log everything: debug traces, HTTP 200s, load balancer health checks. Yet, when a breach occurs, they lack the specific telemetry needed to answer basic questions: *Who authenticated? What data did they access? Did they exfiltrate it?*

Logging for debugging is fundamentally different from logging for security. Security logging demands immutability, high fidelity, and structural consistency.

## Architectural Requirements for Security Logging

### 1. Immutability (WORM Storage)
If an attacker gains domain admin privileges, their first action is to clear the Event Logs (`wevtutil cl System`) or `rm -rf /var/log`.

Logs must be stored in a WORM (Write Once, Read Many) repository.

```text
[ Web Server ] --(TLS/Syslog)--> [ Log Aggregator ]
                                       |
                                       v
                                 [ Cloud WORM Bucket ]
                                 (Object Lock: 1 Year)
```
In an AWS context, this means an S3 bucket with Object Lock enabled in Compliance Mode. Even the root user cannot delete or alter logs until the retention period expires.

### 2. Standardized Taxonomy
A SIEM cannot correlate authentication failures if the Linux servers log `auth_fail=1` and the Windows servers log `EventID=4625`.

Use a standardized schema like the Elastic Common Schema (ECS) or Splunk Common Information Model (CIM).

```json
// Poor Logging
{ "msg": "User bob failed to login", "ip": "10.0.0.5" }

// Robust Security Logging (ECS format)
{
  "@timestamp": "2026-10-14T10:00:00Z",
  "event": {
    "category": ["authentication"],
    "type": ["start"],
    "outcome": "failure"
  },
  "source": {
    "ip": "10.0.0.5"
  },
  "user": {
    "name": "bob",
    "domain": "corp"
  }
}
```

### 3. Actionable Alerting vs. Alert Fatigue
Alerts must be actionable. An alert that requires no human intervention is noise. 

**The Hierarchy of Telemetry:**
- **Logs:** Raw data (e.g., HTTP requests).
- **Events:** Meaningful state changes (e.g., successful SSH login).
- **Alerts:** Events requiring human investigation (e.g., SSH login from a new country for this user).

To prevent alert fatigue, configure thresholds and behavioral baselines.

```yaml
# Example Alert Logic (Pseudo-code)
alert_name: Impossible Travel
description: User authenticated from two distant locations within an impossible timeframe.
condition:
  - event: authentication_success
  - group_by: user.name
  - logic: geo_distance(location1, location2) / time_delta > 800 km/h
action:
  - lock_account()
  - notify_soc()
```

Monitoring without context is just expensive storage. Build the logging pipeline starting from the questions you will need to answer during an incident.
