---
title: "SOC Analyst Interview Questions for Freshers"
type: ARTICLE
categorySlug: security-fundamentals
articleType: INTERVIEW_PREP
description: "20 beginner and intermediate SOC analyst interview questions with short and detailed answers, plus four scenario questions and a repeatable answer framework."
tags: [soc-analyst, interview, freshers, blue-team, siem, incident-response]
---

# SOC Analyst Interview Questions for Freshers

**Quick answer:**
These questions test whether you understand networking, common attacks, logs and a basic triage process. Give a short answer first, then add an example. For scenarios, follow one framework: identify, investigate, contain, escalate, document, prevent. Practise saying answers aloud.

## How to use this guide

Read a question, answer aloud without looking, then compare. Replace the examples with ones from your own labs, since interviewers notice rehearsed answers.

## Beginner questions

### 1. What is the CIA triad?
**Short answer:** Confidentiality, integrity and availability: keeping data private, unaltered and accessible.
**Detailed answer:** Ransomware attacks availability, a leaked database attacks confidentiality, and silent data tampering attacks integrity. Name which property an incident hurts.

### 2. What is the difference between an event, an alert and an incident?
**Short answer:** An event is any logged activity, an alert is an event or pattern flagged by a rule, and an incident is a confirmed security issue needing response.
**Detailed answer:** Thousands of events produce a few alerts; after triage, a small number become incidents.

### 3. What is a SIEM?
**Short answer:** A system that collects logs from many sources, normalises them, lets you search and correlate, and raises alerts.
**Detailed answer:** Mention log sources (endpoints, firewalls, authentication), correlation rules and dashboards, and that its value depends on log quality and tuning.

### 4. What is the difference between a threat, a vulnerability and a risk?
**Short answer:** A threat is a potential cause of harm, a vulnerability is a weakness, and risk is the likelihood and impact of a threat exploiting a vulnerability.

### 5. What is a false positive and a false negative?
**Short answer:** A false positive is an alert on harmless activity; a false negative is a missed real attack.
**Detailed answer:** Too many false positives cause alert fatigue; false negatives are the dangerous ones. Tuning balances both.

### 6. Name common ports and their services.
**Short answer:** 22 SSH, 53 DNS, 80 HTTP, 443 HTTPS, 445 SMB, 3389 RDP.
**Detailed answer:** Explain why exposure of 445 or 3389 to the internet is a concern.

### 7. Explain the TCP three-way handshake.
**Short answer:** SYN, SYN-ACK, ACK establishes a connection.
**Detailed answer:** Mention that many SYNs without completion can indicate scanning or a flood.

### 8. What is DNS and how can it be abused?
**Short answer:** DNS maps names to IP addresses. Attackers abuse it for command-and-control, data exfiltration and look-alike domains.

### 9. What is the difference between hashing and encryption?
**Short answer:** Hashing is one-way and used for integrity and password storage; encryption is reversible with a key.

### 10. Difference between symmetric and asymmetric encryption?
**Short answer:** Symmetric uses one shared key; asymmetric uses a public and private key pair. TLS uses asymmetric methods to agree on keys, then symmetric encryption for the data.

## Intermediate questions

### 11. What is the difference between IDS and IPS?
**Short answer:** An IDS detects and alerts; an IPS can also block traffic inline.

### 12. What is an IOC and how is it different from an IOA?
**Short answer:** An indicator of compromise is evidence such as a hash, IP or domain; an indicator of attack describes behaviour, such as a process chain, regardless of specific artifacts.

### 13. What is EDR?
**Short answer:** Endpoint detection and response monitors endpoint activity, detects suspicious behaviour and supports investigation and containment actions.

### 14. Brute force versus password spraying?
**Short answer:** Brute force tries many passwords against one account; spraying tries a few common passwords across many accounts.
**Detailed answer:** Spraying avoids lockouts. In Windows logs, look at event 4625 volume per source IP versus per account.

### 15. What do Windows events 4624, 4625 and 4672 indicate?
**Short answer:** Successful logon, failed logon, and special privileges assigned to a new logon.

### 16. How do you read a Linux authentication log?
**Short answer:** Check `/var/log/auth.log` or `/var/log/secure` for failed and accepted logins and `sudo` use, and count failures by source IP.

### 17. What is MITRE ATT&CK?
**Short answer:** A knowledge base of adversary tactics and techniques used to describe behaviour and map detections.

### 18. What are the phases of incident response?
**Short answer:** Preparation, detection and analysis, containment, eradication and recovery, and post-incident review.
**Detailed answer:** NIST has revised its incident response guidance, so check the current NIST SP 800-61 wording if an interviewer asks for the exact model.

### 19. What is phishing and how do you triage it?
**Short answer:** Deceptive messages that steal credentials or deliver malware. Triage headers, authentication results, URLs and attachments without opening them.

### 20. What is the difference between vulnerability scanning and penetration testing?
**Short answer:** Scanning automatically finds known weaknesses; penetration testing is a human-led, authorised attempt to exploit them and show impact.

## Scenario-based questions

Use this framework: **identify, investigate, contain, escalate, document, prevent.**

### Scenario A: Many failed logins, then one success
**How to answer:** Identify the account and source IP. Investigate whether the success came from the same source and what the account did next. Contain by resetting the password and ending sessions if suspicious. Escalate if privileged or other signs appear. Document timeline and indicators. Prevent with MFA, lockout policy and detection for the pattern.

### Scenario B: A user reports a suspicious email
**How to answer:** Ask the user not to click. Analyse headers and links safely, search other mailboxes for the same message, block the sender and URL, reset credentials if the user interacted, and report the findings.

### Scenario C: EDR alerts on malware on a laptop
**How to answer:** Confirm the alert, check what the process did, isolate the host through approved tooling, collect evidence, escalate to L2 or incident response, and record actions and timestamps.

### Scenario D: Unusual outbound traffic at 3 AM
**How to answer:** Identify the source host and destination, check reputation and whether it is a known service, review recent process and DNS activity on the host, contain if malicious, and escalate with evidence.

## Preparation checklist

- Practise ports, protocols and the CIA triad until they are automatic
- Complete one phishing lab and one log analysis lab and keep notes
- Write one detection rule and explain its false positives
- Prepare two scenario answers using the framework
- Do not state certifications or experience you do not have

## Practice next

- Windows Event IDs Every SOC Analyst Should Know
- Linux Auth Logs for Security Beginners
- Analyze a Phishing Email lab
