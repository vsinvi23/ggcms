---
title: "Windows Event IDs Every SOC Analyst Should Know"
type: ARTICLE
categorySlug: security-fundamentals
articleType: REFERENCE
description: "A SOC cheat sheet of key Windows Security, System and Sysmon event IDs for logons, accounts, persistence and log tampering, with PowerShell queries to use."
tags: [windows, event-logs, soc, blue-team, sysmon, cheat-sheet]
---

# Windows Event IDs Every SOC Analyst Should Know

**Quick answer:**
Start with a short list: 4624 and 4625 for logons, 4672 for privileged logons, 4688 for process creation, 4720 and 4732 for account and group changes, 7045 and 4698 for persistence, and 1102 for cleared logs. Know the log each lives in and which audit policy must be on.

**Who this is for:** SOC aspirants and junior analysts reading Windows logs in a SIEM or on a host.

**What you will learn:**
- The high-value event IDs and what each one means
- Logon types and why they matter
- PowerShell commands to query them
- Which events need extra auditing before they appear

## Why this matters

Many SIEM alerts boil down to a handful of Windows events. If you recognise them quickly you can tell a normal sign-in from a brute-force attempt or a new persistence mechanism.

## Prerequisites

- Basic Windows administration
- Access to a Windows lab VM, since the Security log needs administrator rights to read

## Logon and authentication (Security log)

| ID | Meaning | What to look for |
|---|---|---|
| 4624 | Successful logon | Logon type, source IP, account, odd hours |
| 4625 | Failed logon | Many failures per account or per source IP |
| 4634 / 4647 | Logoff / user-initiated logoff | Session duration |
| 4648 | Logon with explicit credentials | Lateral movement or `runas` use |
| 4672 | Special privileges assigned | Admin-level logon by unexpected accounts |
| 4740 | Account locked out | Spray or brute-force side effect |
| 4768 / 4769 | Kerberos TGT / service ticket requested | Unusual service ticket volume |
| 4771 | Kerberos pre-authentication failed | Bad passwords against domain accounts |
| 4776 | NTLM credential validation | NTLM use where Kerberos is expected |

### Logon types (in 4624 and 4625)

| Type | Name | Typical meaning |
|---|---|---|
| 2 | Interactive | Console login |
| 3 | Network | File share, remote service |
| 4 | Batch | Scheduled task |
| 5 | Service | Service account start |
| 7 | Unlock | Workstation unlocked |
| 8 | NetworkCleartext | Credentials sent in clear; investigate |
| 9 | NewCredentials | `runas /netonly`-style use |
| 10 | RemoteInteractive | RDP |
| 11 | CachedInteractive | Login with cached domain credentials |

## Accounts and groups (Security log)

| ID | Meaning |
|---|---|
| 4720 | User account created |
| 4722 / 4725 | Account enabled / disabled |
| 4724 / 4723 | Password reset / change attempt |
| 4726 | Account deleted |
| 4728 / 4732 / 4756 | Member added to a global / local / universal security group |

Watch for new accounts followed quickly by a group addition to an admin group.

## Execution and persistence

| ID | Log | Meaning | Note |
|---|---|---|---|
| 4688 | Security | Process created | Needs "Audit Process Creation"; command line needs an extra policy to be recorded |
| 4697 | Security | Service installed | |
| 7045 | System | New service installed | Source: Service Control Manager |
| 4698 / 4702 | Security | Scheduled task created / updated | Needs object access auditing |
| 4104 | PowerShell/Operational | Script block logged | Needs script block logging enabled |

## Tampering and policy

| ID | Log | Meaning |
|---|---|---|
| 1102 | Security | Audit log cleared |
| 104 | System | An event log was cleared |
| 4719 | Security | System audit policy changed |

A cleared log is rarely routine. Treat it as high priority and look at what happened just before it.

## Sysmon events (if Sysmon is installed)

| ID | Meaning |
|---|---|
| 1 | Process creation with command line and hashes |
| 3 | Network connection |
| 11 | File created |
| 13 | Registry value set |
| 22 | DNS query |

Sysmon needs a configuration file; what it records depends on that file.

## Practical example

Query failed logons in the last hour and count them by account and source IP (run in an elevated PowerShell on a lab VM):

```powershell
Get-WinEvent -FilterHashtable @{LogName='Security'; Id=4625; StartTime=(Get-Date).AddHours(-1)} |
  ForEach-Object {
    $x = [xml]$_.ToXml()
    [pscustomobject]@{
      Account = ($x.Event.EventData.Data | Where-Object Name -eq 'TargetUserName').'#text'
      SourceIP = ($x.Event.EventData.Data | Where-Object Name -eq 'IpAddress').'#text'
    }
  } | Group-Object Account, SourceIP | Sort-Object Count -Descending | Select-Object -First 10 Count, Name
```

Interpretation: one source IP failing against many accounts suggests password spraying; one account failing from many sources can mean a targeted attack or a misconfigured application. Check for a 4624 from the same source soon after, because that is when a guess succeeds.

## Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Expecting 4688 to appear by default | Auditing is not enabled everywhere | Check the audit policy before concluding "nothing ran" |
| Ignoring logon type | The ID alone looks normal | Always read type, source and account together |
| Treating every 4625 as an attack | Typos and stale passwords create failures | Look at volume, spread and later success |
| Forgetting 7045 is in the System log | Searching only Security | Query both logs |

## Hands-on practice

On a lab VM, fail a login three times on a test account, then log in successfully. Find the 4625 and 4624 events, note the logon type and source, and run the query above.

## Key takeaways

- A small set of IDs covers most first-pass triage.
- Logon type, account and source matter more than the ID alone.
- Missing events often mean missing audit policy, not missing activity.
- Log clearing (1102, 104) deserves immediate attention.

## Next steps

- Analyze a Phishing Email lab for an end-to-end triage routine
- Write Your First Sigma Detection Rule using process creation events
- SOC Analyst Interview Questions for Freshers
