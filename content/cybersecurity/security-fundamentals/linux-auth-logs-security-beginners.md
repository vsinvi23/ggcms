---
title: "Linux Auth Logs for Security Beginners"
type: ARTICLE
categorySlug: security-fundamentals
articleType: GUIDE
description: "Learn to read Linux authentication logs: find failed SSH logins, spot brute-force patterns, track sudo use and check them with grep, awk and journalctl."
tags: [linux, logs, ssh, authentication, blue-team, beginners]
---

# Linux Auth Logs for Security Beginners

**Quick answer:**
Linux records logins, SSH attempts and `sudo` use in an authentication log: `/var/log/auth.log` on Debian and Ubuntu, `/var/log/secure` on RHEL-family systems, or `journalctl` on systemd hosts. Search for failed and accepted logins, count failures per source IP, and check privileged commands.

**Who this is for:** Beginners in security or system administration who can use a Linux terminal.

**What you will learn:**
- Where authentication events are stored
- How to recognise failed, accepted and invalid-user SSH entries
- How to count and rank failed attempts
- How to review `sudo` activity

## Why this matters

Any internet-facing SSH server gets login attempts constantly. Reading the log tells you whether those are background noise or whether someone got in, and the same skills carry over to SIEM searches.

## Prerequisites

- A Linux VM or WSL where you have `sudo`
- OpenSSH server installed for the practice section (optional)

## Where the logs live

| Distribution family | File | Alternative |
|---|---|---|
| Debian, Ubuntu | `/var/log/auth.log` | `journalctl -u ssh` |
| RHEL, CentOS, Fedora | `/var/log/secure` | `journalctl -u sshd` |

On some minimal installs the file does not exist and only the journal is available. The SSH service unit name (`ssh` or `sshd`) varies by distribution.

## Reading the entries

Sample lines (documentation IP addresses, fictional users):

```text
Oct  5 09:14:02 host sshd[2210]: Failed password for invalid user admin from 203.0.113.45 port 51122 ssh2
Oct  5 09:14:05 host sshd[2212]: Failed password for root from 203.0.113.45 port 51130 ssh2
Oct  5 09:20:41 host sshd[2301]: Accepted publickey for priya from 198.51.100.7 port 40222 ssh2
Oct  5 09:22:10 host sudo:   priya : TTY=pts/0 ; PWD=/home/priya ; USER=root ; COMMAND=/usr/bin/apt update
```

| Pattern | Meaning |
|---|---|
| `Failed password for invalid user X` | Login attempt for an account that does not exist |
| `Failed password for root` | Attempt against root over password |
| `Accepted password/publickey for X` | Successful login and the method used |
| `sudo: X : ... COMMAND=...` | User X ran a command with privileges |

## Step-by-step

### 1. Count failed logins per source IP

```bash
sudo grep "Failed password" /var/log/auth.log \
  | awk '{for(i=1;i<=NF;i++) if($i=="from") print $(i+1)}' \
  | sort | uniq -c | sort -rn | head
```

Why: one IP with hundreds of failures is a brute-force pattern. A few failures from many IPs can be a distributed attempt.

### 2. See which usernames are tried

```bash
sudo grep "invalid user" /var/log/auth.log | awk '{print $(NF-5)}' | sort | uniq -c | sort -rn | head
```

Field positions depend on the line format, so print a few lines first and adjust the `$` number if the output looks wrong.

### 3. Check for successful logins

```bash
sudo grep "Accepted" /var/log/auth.log
last -a | head
```

Compare each accepted login against what you expect. A success from an unfamiliar IP right after many failures needs investigation.

### 4. Review sudo use

```bash
sudo grep "sudo:" /var/log/auth.log | grep COMMAND
```

### 5. Use the journal on systemd hosts

```bash
sudo journalctl -u ssh --since "1 hour ago" | grep -E "Failed|Accepted"
```

## Practical example: a quick triage

1. Rank failures by IP (step 1) and note the top source.
2. Check whether that IP ever appears in an `Accepted` line.
3. If it does, check what that account ran with `sudo` and when.
4. Record the IP, account, time and conclusion.

## Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Looking at the wrong file | Distribution differences | Check both paths and the journal |
| Reading only the rotated-out file | Logs rotate | Also check `auth.log.1` and compressed archives with `zgrep` |
| Blocking an IP and stopping | Looks like a fix | Also check for a successful login and harden SSH |
| Trusting logs after compromise | Attackers can edit logs | Forward logs to a separate system |

## Hands-on practice

On a lab VM, make three wrong SSH attempts, then one correct one. Find all four entries, then run step 1 and step 3. Afterwards, practise hardening on the lab VM only: key-based authentication and disabling root login in `sshd_config`, reloading the service and confirming you can still log in from a second session before closing the first.

## FAQs

### Does a failed-login spike mean I was hacked?
Not by itself. It means the service is being probed. A successful login from the same source, or unusual activity after a login, is what raises concern.

### Should I block attackers by IP?
It can reduce noise, but strong authentication (keys, MFA, no password login) is the lasting defence.

## Key takeaways

- Know your distribution's log location and fall back to `journalctl`.
- Count, rank and compare failed against accepted logins.
- Send logs off the host so they survive a compromise.

## Next steps

- Windows Event IDs Every SOC Analyst Should Know
- Analyze a Phishing Email lab
- SOC Analyst Interview Questions for Freshers
