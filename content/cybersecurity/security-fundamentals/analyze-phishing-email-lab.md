---
title: "Lab: Analyze a Phishing Email Step by Step"
type: ARTICLE
categorySlug: security-fundamentals
articleType: HOW_TO
description: "Hands-on beginner lab: read email headers, check SPF, DKIM and DMARC, defang URLs, hash attachments and write an incident note using a safe synthetic sample."
tags: [phishing, email-security, soc, incident-response, blue-team, lab]
---

# Lab: Analyze a Phishing Email Step by Step

**Difficulty:** Beginner
**Estimated time:** 45 minutes
**Skills practiced:** Email header analysis, SPF/DKIM/DMARC reading, URL defanging, file hashing, indicator recording
**Safety:** Everything here uses a synthetic sample with reserved example domains and documentation IP ranges. Do the lab on a personal machine or a disposable VM. Never click links or open attachments from real suspicious emails on a work machine; follow your organisation's reporting process instead.

**Quick answer:**
To analyze a phishing email safely, never open its links or attachments. Read the raw headers for sender mismatches and SPF, DKIM and DMARC results, defang every URL before inspecting it, hash attachments instead of running them, then record indicators and report. This lab walks through a synthetic sample on your own machine.

**Who this is for:** SOC aspirants, IT support staff and students who want a repeatable first-pass phishing triage routine.

**What you will learn:**
- Which header fields reveal a spoofed or mismatched sender
- How to read SPF, DKIM and DMARC results
- How to extract and defang URLs and hash a file without executing it
- How to write indicators and a short incident note

## Why this matters

Phishing is a common way attackers get a first foothold, and triaging reported emails is a daily task for many SOC analysts. A consistent routine keeps you safe and makes your notes useful to the next person who picks up the case.

## Objective

Triage one suspicious email and finish with a verdict (phishing, spam or legitimate), a list of indicators, and a short report.

## Environment

- A personal laptop or disposable VM with Python 3 and a terminal (Linux, macOS or WSL)
- A text editor
- No internet access to the sample's links is needed or wanted

## Steps

### 1. Save the sample

Save this as `sample.eml`. All names and addresses are fictional; `.example` domains and `203.0.113.0/24` are reserved for documentation.

```text
Return-Path: <billing@examplepay-support.example>
Received: from mail.sender-host.example (mail.sender-host.example [203.0.113.45])
 by mx.corp.example with ESMTP id 4f2a91; Mon, 5 Oct 2026 09:14:22 +0530
Authentication-Results: mx.corp.example;
 spf=fail smtp.mailfrom=examplepay-support.example;
 dkim=none;
 dmarc=fail header.from=examplepay.example
From: "ExamplePay Support" <billing@examplepay-support.example>
Reply-To: recovery.desk@freemail.example
To: priya@corp.example
Subject: Action required: verify your account within 24 hours
Message-ID: <20261005091422.7781@mail.sender-host.example>
Date: Mon, 5 Oct 2026 09:14:20 +0530
Content-Type: text/plain; charset=UTF-8

Dear customer,

Your account will be suspended. Verify now:
https://examplepay-verify.example/login?session=8841

See the attached invoice_4471.pdf.exe for details.
```

### 2. Print the headers that matter

Save this as `headers.py`:

```python
import sys
from email import policy
from email.parser import BytesParser

with open(sys.argv[1], "rb") as f:
    msg = BytesParser(policy=policy.default).parse(f)

for h in ("From", "Reply-To", "Return-Path", "Message-ID", "Subject"):
    print(f"{h}: {msg[h]}")
print("\nReceived chain (top = last hop):")
for r in msg.get_all("Received", []):
    print(" -", " ".join(str(r).split()))
print("\nAuthentication-Results:", " ".join(str(msg["Authentication-Results"]).split()))
```

```bash
python3 headers.py sample.eml
```

Why: the display name is free text anyone can set. The fields that carry evidence are the envelope sender (`Return-Path`), the `Reply-To`, the `Received` chain and the authentication results.

### 3. Compare sender fields

| Field | Value in sample | What to notice |
|---|---|---|
| From (display) | ExamplePay Support | Looks legitimate; it is just text |
| From (address) | billing@examplepay-support.example | Domain differs from the brand domain `examplepay.example` |
| Reply-To | recovery.desk@freemail.example | Replies go to a free mailbox, not the claimed company |
| Return-Path | examplepay-support.example | Matches From, so alignment alone proves nothing |

A look-alike domain plus a different `Reply-To` is a classic pattern. It is an indicator, not proof.

### 4. Read SPF, DKIM and DMARC

- **SPF** checks whether the sending server's IP is authorised for the envelope domain. Sample: `fail`.
- **DKIM** checks a cryptographic signature added by the sending domain. Sample: `none`, meaning no signature.
- **DMARC** asks whether SPF or DKIM passed *and aligned* with the visible From domain, and states the owner's policy. Sample: `fail`.

A pass on all three does not make an email safe, because attackers can register their own domain and authenticate it correctly. A fail on all three on a message claiming to be a known brand is a strong signal.

### 5. Extract and defang URLs

Defanging stops a URL from being clickable by accident.

```bash
grep -Eo 'https?://[^ >"]+' sample.eml | sed 's#http#hxxp#; s#\.#[.]#g'
```

Expected: `hxxps://examplepay-verify[.]example/login?session=8841`

Look at the domain (not the path), whether it imitates a brand, and whether it is on a different domain than the sender.

### 6. Handle the attachment name without running it

Do not download real malware for this lab. Create a harmless stand-in and examine it like evidence:

```bash
printf 'harmless test file' > invoice_4471.pdf.exe
file invoice_4471.pdf.exe
sha256sum invoice_4471.pdf.exe
```

The double extension `.pdf.exe` is the red flag: the real type is the last extension. In a real case you would submit only the hash, or the file inside an isolated sandbox, to your organisation's approved analysis service. Never open the file on your own machine.

### 7. Decide and record

Verdict for the sample: **phishing**. Evidence: look-alike domain, mismatched Reply-To, SPF/DMARC fail, no DKIM, urgency language, credential link, executable disguised as a PDF.

## Expected output

An indicator list and a short note like:

```text
Case: PH-0001 (lab)
Verdict: Phishing (credential harvesting + executable lure)
Indicators:
  sender:   billing@examplepay-support[.]example
  reply-to: recovery.desk@freemail[.]example
  sending IP: 203.0.113.45 (documentation range in this lab)
  url:      hxxps://examplepay-verify[.]example/login
  file:     invoice_4471.pdf.exe  sha256: <value from your run>
Auth: SPF fail, DKIM none, DMARC fail
Actions: block sender/domain/URL, search mailboxes for the same subject, notify recipient
```

<svg viewBox="0 0 640 120" role="img" aria-label="Phishing triage flow: headers, authentication, URLs, attachments, verdict">
<title>Phishing triage flow</title>
<desc>Five steps in order: read headers, check SPF DKIM DMARC, defang URLs, hash attachments, record verdict.</desc>
<rect x="0" y="0" width="640" height="120" fill="#ffffff"/>
<rect x="10" y="35" width="110" height="50" rx="8" fill="#e8f0fe" stroke="#1a56db" stroke-width="2"/>
<text x="65" y="65" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#111827">Headers</text>
<rect x="135" y="35" width="110" height="50" rx="8" fill="#e8f0fe" stroke="#1a56db" stroke-width="2"/>
<text x="190" y="65" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#111827">SPF/DKIM/DMARC</text>
<rect x="260" y="35" width="110" height="50" rx="8" fill="#e8f0fe" stroke="#1a56db" stroke-width="2"/>
<text x="315" y="65" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#111827">Defang URLs</text>
<rect x="385" y="35" width="110" height="50" rx="8" fill="#e8f0fe" stroke="#1a56db" stroke-width="2"/>
<text x="440" y="65" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#111827">Hash files</text>
<rect x="510" y="35" width="120" height="50" rx="8" fill="#fef3c7" stroke="#b45309" stroke-width="2"/>
<text x="570" y="65" text-anchor="middle" font-family="system-ui, sans-serif" font-size="13" fill="#111827">Verdict + report</text>
<line x1="120" y1="60" x2="135" y2="60" stroke="#374151" stroke-width="2"/>
<line x1="245" y1="60" x2="260" y2="60" stroke="#374151" stroke-width="2"/>
<line x1="370" y1="60" x2="385" y2="60" stroke="#374151" stroke-width="2"/>
<line x1="495" y1="60" x2="510" y2="60" stroke="#374151" stroke-width="2"/>
</svg>

*Figure 1: The five-step triage order used in this lab, ending with a recorded verdict.*

## Troubleshooting

| Issue | Fix |
|---|---|
| `python3: command not found` | Install Python 3, or use WSL on Windows |
| Headers print as `None` | Check the file has no leading blank line and the header names match exactly |
| `grep` returns nothing | Confirm the URL line starts with `https://` and has no leading spaces |
| `sha256sum` missing on macOS | Use `shasum -a 256 invoice_4471.pdf.exe` |

## Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Trusting the display name | It looks official | Always read the actual address and domain |
| Treating SPF pass as safe | Attackers authenticate their own domains | Use auth results as one signal among several |
| Clicking a link to check it | Curiosity | Defang first, and use approved analysis tools |
| Opening the attachment | Wanting to see what it does | Hash it and submit to a sandbox |

## FAQs

### Can a phishing email pass SPF, DKIM and DMARC?
Yes. If the attacker controls the sending domain and configures it correctly, all three can pass. Authentication proves the domain, not the intent.

### What should I do with a real suspicious email at work?
Do not forward it casually or interact with it. Use your organisation's phishing-report button or security mailbox so it can be analysed safely.

## Cleanup

```bash
rm -f sample.eml headers.py invoice_4471.pdf.exe
```

## Key takeaways

- The display name is not evidence; headers and authentication results are.
- Defang indicators and never execute attachments.
- Record indicators and actions so others can act on your findings.

## Next steps

- Read Linux Auth Logs for Security Beginners to practise log reading
- Write Your First Sigma Detection Rule to turn a finding into a detection
- Review the SOC Analyst Interview Questions for Freshers, which include a phishing scenario
