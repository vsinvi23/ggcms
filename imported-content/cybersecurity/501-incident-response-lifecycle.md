# Incident Response from First Alert to Recovery: The PICERL Framework

## The Problem: Chaos During a Breach
When a high-severity alert fires—a domain controller beaconing to an unknown IP, or mass file encryption across endpoints—the default human reaction is panic. Without a structured framework, engineers pull network cables, delete compromised virtual machines, and destroy forensic evidence, all while failing to contain the actual threat actor.

Incident Response (IR) is not improvisation; it is the execution of pre-compiled playbooks designed to minimize damage, preserve evidence, and restore normal operations.

## The Architecture of Response: PICERL
The industry standard for IR is the PICERL framework, defined by SANS. It divides the chaos into six deterministic phases.

```text
[Preparation] -> [Identification] -> [Containment]
                                           |
                                           v
[Lessons] <- [Recovery] <- [Eradication] <-+
```

### 1. Preparation
Preparation occurs before the incident. It involves configuring logging, establishing out-of-band communication channels, and defining the Incident Response Team (IRT). 
If you are deciding who has the authority to isolate a production database during an active breach, you have already failed.

**Key Deliverables:**
- WORM (Write Once, Read Many) log storage.
- Golden images for rapid redeployment.
- Hard-printed playbooks (if active directory falls, digital wikis may be inaccessible).

### 2. Identification
This is the triage phase. It determines whether an anomaly is a false positive or a true positive incident.

**Technical Action:** 
A SIEM alert fires indicating `mimikatz.exe` was executed. The analyst correlates this with authentication logs to map the blast radius.

```json
// Example SIEM Alert Context
{
  "alert_id": "ALRT-992",
  "severity": "CRITICAL",
  "trigger": "Process Execution: mimikatz.exe",
  "host": "PROD-DB-01",
  "user": "svc_sql_admin",
  "action": "Isolate host and page IRT"
}
```

### 3. Containment
Stop the bleeding. Containment is split into short-term (putting the host in a quarantine VLAN) and long-term (patching the vulnerability that allowed the initial vector while monitoring for persistence).

*Critical Rule:* Never turn off a compromised machine immediately. Suspend or hibernate virtual machines to capture volatile memory (RAM), which contains decryption keys, active network connections, and unencrypted malware payloads.

### 4. Eradication
With the threat contained, systematically remove the adversary's access. This includes deleting malware, terminating compromised accounts, and fixing the underlying vulnerability.

If the attacker used a zero-day exploit, eradication involves applying the vendor patch. If credentials were stolen, it involves forcing a global password reset and rotating Kerberos Ticket Granting Ticket (krbtgt) passwords.

### 5. Recovery
Return to normal operations cautiously. Systems are restored from known-good backups (not backups taken during the infection window).

**Validation Checklist:**
- Are vulnerability scans clean?
- Are baseline metrics nominal?
- Is endpoint detection and response (EDR) reporting actively?

### 6. Lessons Learned (Post-Incident)
Within two weeks of the incident, the IRT must convene to analyze the failure. 
- Why did the initial vector succeed?
- Did the SIEM fire quickly enough?
- Did the containment strategy work?

The output of this phase feeds directly back into **Preparation**, closing the loop.
