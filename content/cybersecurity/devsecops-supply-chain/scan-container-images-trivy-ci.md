---
title: "Scan Container Images with Trivy in CI"
type: ARTICLE
categorySlug: devsecops-supply-chain
articleType: HOW_TO
description: "Hands-on lab: scan a container image for vulnerabilities and secrets with Trivy, fail a CI build on serious findings, and handle false positives and ignores."
tags: [trivy, container-security, devsecops, ci-cd, vulnerability-scanning, docker]
---

# Scan Container Images with Trivy in CI

**Difficulty:** Beginner to intermediate
**Estimated time:** 40 minutes
**Skills practiced:** Image scanning, severity gating, CI integration, triage of findings
**Safety:** Scan only images you build or are permitted to test. Use a throwaway VM or local Docker and do not push test images to shared registries.

**Quick answer:**
Trivy is an open-source scanner that checks container images for known vulnerabilities, misconfigurations and exposed secrets. Run `trivy image` locally, then add it to CI with a severity threshold and an exit code so builds fail on serious, fixable findings. Review results rather than blindly ignoring them.

**Who this is for:** DevOps and cloud learners who build Docker images and want a security gate in their pipeline.

**What you will learn:**
- How to scan an image and read the report
- How to fail a build on HIGH and CRITICAL findings
- How to reduce noise with fixed-only filtering and a reviewed ignore file
- How to add the scan to a CI workflow

## Why this matters

Images inherit vulnerabilities from base layers and packages. A scan in CI finds known issues before deployment and gives developers fast feedback, though it cannot find unknown flaws or logic bugs.

## Objective

Scan a small image, understand the findings, and make a pipeline step that fails on severe fixable vulnerabilities.

## Environment

- Docker installed locally
- Trivy installed, following the install instructions on the official Trivy documentation for your OS
- A GitHub repository, if you want to try the CI step

## Steps

### 1. Build a small image

```dockerfile
# Dockerfile
FROM python:3.9-slim
WORKDIR /app
COPY app.py .
CMD ["python", "app.py"]
```

```bash
echo 'print("hello")' > app.py
docker build -t lab-app:1.0 .
```

An older base tag is used on purpose so the scan has something to find. Results change over time as vulnerability data and base images change.

### 2. Scan the image

```bash
trivy image lab-app:1.0
```

The first run downloads the vulnerability database, so it needs network access. The report lists the package, installed version, the fixed version if one exists, the severity and a CVE ID.

### 3. Focus on what matters

```bash
trivy image --severity HIGH,CRITICAL --ignore-unfixed lab-app:1.0
```

`--ignore-unfixed` hides vulnerabilities with no available fix, which keeps the gate actionable. Track those separately; do not forget them.

### 4. Fail the build on severe findings

```bash
trivy image --severity HIGH,CRITICAL --ignore-unfixed --exit-code 1 lab-app:1.0
echo "exit code: $?"
```

Exit code 1 means findings matched; 0 means none did. CI treats a non-zero code as failure.

### 5. Fix by updating the base image

Change `FROM python:3.9-slim` to a currently supported Python release tag, rebuild and scan again. Compare the counts. Updating the base is usually the highest-impact fix.

### 6. Scan for secrets and misconfiguration

```bash
trivy image --scanners vuln,secret lab-app:1.0
trivy config .
```

`trivy config .` checks files such as the Dockerfile and IaC for misconfiguration.

### 7. Add it to CI

```yaml
name: image-scan
on: [push, pull_request]
jobs:
  scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Build image
        run: docker build -t lab-app:${{ github.sha }} .
      - name: Scan image
        uses: aquasecurity/trivy-action@<pinned-version-or-commit>
        with:
          image-ref: lab-app:${{ github.sha }}
          severity: HIGH,CRITICAL
          ignore-unfixed: true
          exit-code: '1'
```

Pin the action to a specific release or commit SHA after checking the official `trivy-action` README for the current version and input names. Pinning reduces supply-chain risk from a moving tag.

### 8. Handle accepted risks properly

If a finding is a verified false positive or not reachable, record it in a `.trivyignore` file with a comment, an owner and an expiry date, so ignores are reviewed and not forgotten.

```text
# CVE-XXXX-XXXXX: not reachable, package unused at runtime. Owner: team-a. Review by 2027-01-31
CVE-XXXX-XXXXX
```

Replace the placeholder with a real CVE ID from your own report.

## Expected output

The first scan lists many findings. After updating the base image and re-scanning with the gate options, the count of HIGH and CRITICAL fixable findings should be much lower or zero, and the exit code should be 0.

## Troubleshooting

| Issue | Fix |
|---|---|
| Database download fails | Check network or proxy settings; Trivy needs to fetch its database |
| Scan is slow in CI | Cache the Trivy database between runs |
| Too many findings | Use severity filtering and `--ignore-unfixed`, and update the base image |
| Build fails on an unfixed issue | Confirm `--ignore-unfixed` is set and decide on a documented exception |
| Action input not recognised | Check the action version's README; inputs change |

## Common mistakes

| Mistake | Why it happens | How to avoid it |
|---|---|---|
| Ignoring everything to get green builds | Pressure to ship | Require owner and expiry on every ignore |
| Scanning only once | One-off check | Rescan on a schedule, since new CVEs appear later |
| Using `latest` tags | Convenience | Pin tags or digests for repeatable scans |
| Treating a clean scan as secure | False confidence | Scans find known issues only |

## Cleanup

```bash
docker rmi lab-app:1.0
rm -f Dockerfile app.py
```

## Key takeaways

- Scan early, gate on severity and fixability, and keep ignores reviewed.
- Base image updates fix most findings.
- A scanner is one control among several, not a guarantee.

## Next steps

- Nmap Cheat Sheet for Authorized Scanning
- Windows Event IDs Every SOC Analyst Should Know
- SOC Analyst Roadmap for Freshers in India
