# SOAR Explained: Orchestration and Automated Playbooks

## The Problem: The Analyst Bottleneck
Your SIEM is highly tuned. It generates 50 high-fidelity alerts per day. However, investigating a single alert—say, a suspicious email attachment—requires an analyst to:
1. Extract the file hash from the alert.
2. Query VirusTotal for the hash reputation.
3. Query the endpoint protection platform (EDR) to see if the file executed.
4. Search Microsoft 365 to see who else received the email.
5. If malicious, manually purge the email and isolate the host.

This takes 30 minutes. At 50 alerts, you need multiple full-time analysts just to keep up.

Security Orchestration, Automation, and Response (SOAR) platforms eliminate this manual drudgery.

## SOAR Architecture

SOAR sits on top of the SIEM and interacts with the rest of the infrastructure via APIs.

```text
       [ SIEM ] --(Alert: Suspicious Login)--> [ SOAR ]
                                                  |
     +--------------------------------------------+-----------------------+
     | (Query IP)                                 | (Lock Account)        | (Create Ticket)
     v                                            v                       v
[ Threat Intel (CrowdStrike) ]              [ Identity (Okta) ]      [ Jira / PagerDuty ]
```

## Orchestration vs. Automation
- **Automation** is executing a single task (e.g., a Python script blocking an IP on a firewall).
- **Orchestration** is coordinating multiple automated tasks across disparate systems to execute a complete workflow.

## The Playbook Concept
SOAR operates on Playbooks—visual or code-based workflows triggered by specific alert types.

### Example Playbook: Phishing Investigation

```python
# Simplified Python representation of a SOAR playbook execution
def handle_phishing_alert(alert):
    # 1. Enrichment
    indicators = extract_iocs(alert.email_body)
    reputation = check_virustotal(indicators['urls'])
    
    # 2. Decision Logic
    if reputation.score > 70:
        # 3. Containment Actions
        block_url_on_firewall(indicators['urls'])
        delete_email_from_all_inboxes(alert.message_id)
        
        # 4. Notification
        create_jira_ticket(severity="HIGH", actions_taken=True)
        notify_slack_channel(f"Phishing campaign stopped. ID: {alert.id}")
    else:
        create_jira_ticket(severity="LOW", status="Awaiting Manual Review")
```

## The Value Proposition
1. **Speed (MTTR):** Mean Time to Respond drops from hours to seconds. The playbook executes containment actions at machine speed.
2. **Consistency:** Playbooks guarantee that every alert is handled exactly the same way, preventing analyst fatigue from leading to skipped steps.
3. **Force Multiplier:** Analysts stop performing data entry and start performing high-level threat hunting and malware analysis.

SOAR does not replace human analysts; it replaces the robotic tasks humans shouldn't be doing in the first place.
