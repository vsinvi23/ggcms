---
title: "Nmap Cheat Sheet for Authorized Scanning"
type: ARTICLE
categorySlug: security-fundamentals
articleType: REFERENCE
description: "A practical Nmap cheat sheet for authorized scans: host discovery, port and service detection, safe timing, output formats and reading results, with legal-use guidance."
tags: [nmap, network-scanning, reconnaissance, cheat-sheet, tools, security-testing]
---

# Nmap Cheat Sheet for Authorized Scanning

**Quick answer:**
Nmap discovers hosts, open ports and running services. Use `nmap -sn` for host discovery, `nmap -sV -p-` or a port list for services, save output with `-oA`, and scan only systems you own or have written permission to test. This sheet lists the common commands and how to read them.

**Who this is for:** Students, IT administrators and security practitioners who need to scan their own lab or authorised networks.

**What you will learn:**
- The core Nmap commands and what each option does
- How to scan safely and save results
- How to read port states
- Where the legal and ethical boundaries are

## Authorization and legal use

Scan only networks and hosts you own or have **written authorization** to test. Unauthorized scanning can breach policy or law, depending on where you are and what you scan, and can disrupt fragile systems. Use a lab you control, for example a VM network, or the host `scanme.nmap.org`, which the Nmap project provides for limited, polite testing; read its usage terms first. If you find a vulnerability in a system you do not own, report it through the owner's disclosure process rather than exploring it.

## Quick reference

| Goal | Command |
|---|---|
| Ping/host discovery only | `nmap -sn 192.168.56.0/24` |
| Default scan (top 1000 TCP ports) | `nmap 192.168.56.10` |
| Specific ports | `nmap -p 22,80,443 192.168.56.10` |
| All TCP ports | `nmap -p- 192.168.56.10` |
| Service and version detection | `nmap -sV 192.168.56.10` |
| Default scripts plus version | `nmap -sC -sV 192.168.56.10` |
| OS detection (needs privileges) | `sudo nmap -O 192.168.56.10` |
| UDP top ports (slow, needs privileges) | `sudo nmap -sU --top-ports 20 192.168.56.10` |
| Skip host discovery | `nmap -Pn 192.168.56.10` |
| Save in all formats | `nmap -sV -oA scan-lab 192.168.56.10` |
| Slower, gentler timing | `nmap -T2 192.168.56.10` |
| Read targets from a file | `nmap -iL targets.txt` |

The addresses above are private lab examples. Replace them with systems you are authorised to scan.

## Port states

| State | Meaning |
|---|---|
| open | A service is accepting connections |
| closed | Reachable, no service listening |
| filtered | Nmap cannot tell, often a firewall is dropping packets |
| open\|filtered | Nmap cannot decide between open and filtered (common with UDP) |

## Practical example

```bash
nmap -sV -p 22,80,443 -oA scan-lab 192.168.56.10
```

Sample output (illustrative):

```text
PORT    STATE SERVICE VERSION
22/tcp  open  ssh     OpenSSH 9.x
80/tcp  open  http    nginx 1.x
443/tcp closed https
```

Reading it: SSH and a web server are exposed; 443 is closed, so HTTPS is not served on that host. Ask whether each open port is intended, and whether the versions are supported and patched. Version detection is a fingerprint, so confirm important findings another way.

## Scan results as evidence

`-oA scan-lab` writes three files: `.nmap` (readable), `.xml` (for tools) and `.gnmap` (greppable). Keep them with the date and the authorisation reference.

## Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Scanning without permission | Curiosity | Get written scope first |
| Using aggressive timing on fragile devices | Wanting speed | Start slower, scan during agreed windows |
| Trusting "closed" on a firewalled host | Filtering hides services | Scan from the same network position users would |
| Skipping UDP | It is slow | Include key UDP ports such as DNS and SNMP when relevant |
| Not saving output | Quick scans feel temporary | Always use `-oA` |

## Hands-on practice

Set up two VMs on a host-only network, run a web server on one, and use the table above to discover it, list its ports and identify the service version. Then close a port and re-scan to see the change.

## FAQs

### Is `-A` a good default?
It enables several intrusive options at once. Prefer choosing the options you need so you know what the scan does.

### Why does a scan differ between runs?
Firewalls, rate limits and timing can change results. Record the exact command and time.

## Key takeaways

- Authorization first, scanning second.
- Save output, record scope, and verify important results.
- Understand port states before drawing conclusions.

## Next steps

- Linux Auth Logs for Security Beginners
- Scan Container Images with Trivy in CI
- SOC Analyst Roadmap for Freshers in India
