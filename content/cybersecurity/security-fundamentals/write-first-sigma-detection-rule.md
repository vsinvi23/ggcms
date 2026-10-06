---
title: "Write Your First Sigma Detection Rule"
type: ARTICLE
categorySlug: security-fundamentals
articleType: GUIDE
description: "Learn the Sigma rule format by writing a rule for PowerShell encoded commands, mapping it to MITRE ATT&CK, testing it safely and tuning false positives."
tags: [sigma, detection-engineering, soc, mitre-attack, powershell, blue-team]
---

# Write Your First Sigma Detection Rule

**Quick answer:**
Sigma is a vendor-neutral YAML format for describing log detections. You write the logic once, with a log source, selections and a condition, then convert it to your SIEM's query language. This guide builds a rule that flags PowerShell launched with an encoded command and shows how to test and tune it.

**Who this is for:** Beginner to intermediate SOC aspirants who can read logs and want to start writing detections.

**What you will learn:**
- The structure of a Sigma rule
- How to write selections, modifiers and a condition
- How to map a rule to MITRE ATT&CK
- How to test it and reduce false positives

## Why this matters

Alerts are only as good as their logic. Writing detections in Sigma gives you a portable, reviewable format and forces you to state what you detect, from which log, and what normal activity might trigger it.

## Prerequisites

- Comfort reading YAML
- Know what a process creation event is (see the Windows Event IDs cheat sheet)
- A Windows lab VM with Sysmon, or process creation auditing with command line enabled
- Python 3 for the converter (optional)

## The anatomy of a rule

| Field | Purpose |
|---|---|
| `title`, `id`, `status` | Name, unique UUID, maturity (`experimental`, `test`, `stable`) |
| `description`, `references`, `author`, `date` | Context for reviewers |
| `tags` | ATT&CK mapping, e.g. `attack.t1059.001` |
| `logsource` | Which logs the rule needs (`category`, `product`, `service`) |
| `detection` | Named selections plus a `condition` |
| `falsepositives` | Known benign causes |
| `level` | Severity: informational to critical |

## Step-by-step

### 1. Choose the behaviour and the log

Behaviour: PowerShell started with an encoded command, which attackers use to hide script content (ATT&CK T1059.001). Legitimate tools also do this, so expect some noise.

Log: process creation with the full command line, from Sysmon event 1 or Windows event 4688 with command line logging.

### 2. Write the rule

```yaml
title: PowerShell Launched With Encoded Command
id: 3f6c2d1e-8a4b-4c57-9e21-5b7d0a1c9e42
status: experimental
description: Detects PowerShell started with an encoded command argument, a common way to obscure script content.
references:
    - https://attack.mitre.org/techniques/T1059/001/
author: TODO real author
date: 2026-10-06
tags:
    - attack.execution
    - attack.t1059.001
logsource:
    category: process_creation
    product: windows
detection:
    selection_image:
        Image|endswith:
            - '\powershell.exe'
            - '\pwsh.exe'
    selection_cli:
        CommandLine|contains:
            - ' -enc'
            - ' -ec '
    condition: selection_image and selection_cli
falsepositives:
    - Software deployment and management tools that pass encoded commands
    - Administrator scripts that encode arguments
level: medium
```

Generate your own `id` (any UUID v4) rather than reusing this one.

### 3. Understand the logic

- `|endswith` and `|contains` are **modifiers** that change how a value is matched. Matching of strings is case-insensitive by default.
- A list under one field means *any* value matches (OR).
- `condition: selection_image and selection_cli` requires both groups (AND).
- PowerShell accepts shortened parameter names, so `-enc`, `-ec` and `-EncodedCommand` all work. This rule covers the common forms but not every abbreviation, which is a known limitation to document.

### 4. Convert it to your SIEM query

```bash
pip install sigma-cli
sigma plugin list
sigma plugin install splunk
sigma convert -t splunk -p sysmon rule.yml
```

Pipeline and target names depend on your SIEM and plugin versions. Check `sigma convert --help` and the pySigma plugin documentation for your platform before relying on the output.

### 5. Test it safely

On your own lab VM only, generate a harmless encoded command:

```powershell
$cmd = 'Write-Host "sigma test"'
$enc = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($cmd))
powershell.exe -NoProfile -EncodedCommand $enc
```

Confirm the process creation event appears in your log source with the full command line, then confirm your converted query matches it. If the event is missing, fix logging before blaming the rule.

### 6. Tune

Run the query against a week of normal logs in a test environment. For each hit, ask whether it is a known tool. Add narrow exclusions, for example on a specific parent process or signed management tool, instead of loosening the detection. Record every exclusion in the rule's `falsepositives` field.

## Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Rule needs a field your logs do not have | Written against Sysmon, deployed on plain 4688 | Check `logsource` and field availability first |
| Overly broad matches like `-e` | Wanting full coverage | Prefer specific patterns, then widen with evidence |
| No false-positive notes | Rushing to ship | Test on normal data and record findings |
| Copy-pasting rules unseen | Looks authoritative | Read, test and understand every rule you deploy |

## Hands-on practice

Write a second rule for the Windows event 1102 (audit log cleared) using the `windows` product and the `security` service. Decide the severity, list false positives, tag it with an ATT&CK technique you can justify, and check your tag against the ATT&CK site.

## FAQs

### Do I need to know every SIEM language?
No. Sigma's point is to write the logic once and convert it. You still need to read the converted query to confirm it matches your data.

### Where can I find example rules to study?
The SigmaHQ repository contains many community rules. Read them to learn patterns, and test any rule before deploying it.

## Key takeaways

- A good rule states the behaviour, the log source, the match logic and known false positives.
- Test on a lab VM, then tune against normal data.
- Document limitations such as partial coverage of abbreviations.

## Next steps

- Windows Event IDs Every SOC Analyst Should Know
- Analyze a Phishing Email lab
- SOC Analyst Roadmap for Freshers in India
