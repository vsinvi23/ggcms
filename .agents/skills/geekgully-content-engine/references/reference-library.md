# GeekGully Approved Reference Library

Used by both CREATE and REVIEW modes to research, verify, and cite. URLs below were supplied by the
GeekGully owner; **verify a link resolves and the page supports the claim before citing it**, and
link the exact page, not the homepage. Entries marked ⚠ have a known caveat.

## Source-selection rules

1. Prefer official vendor documentation and security advisories.
2. Prefer government and standards bodies for regulations, frameworks, national guidance, threat advice.
3. Prefer primary projects and research organizations for security concepts, attack techniques,
   detections, defensive controls.
4. Prefer official certification bodies for exam objectives, eligibility, pricing, requirements.
5. Use GitHub repos only for practical examples, tool docs, vulnerable lab environments, detection
   content, payload references, open-source reference material.
6. Awesome lists are discovery aids, never primary evidence.
7. Never cite a repo as proof of a vulnerability, statistic, salary, certification requirement, or
   product behavior unless it is the official source.
8. Link to the exact doc page, advisory, CVE, rule, template, release, or file.
9. Check a repo is actively maintained (recent commits/releases/issues) before recommending it.
10. On conflict, official documentation and primary advisories win over community content.

## Citation format (every factual claim)

- Claim / Source name / Direct URL / What the source supports / Reviewed date (YYYY-MM-DD)

## Content-type routing

| Content | Primary sources | Labs / tools |
|---|---|---|
| Cybersecurity basics | OWASP, NIST, CISA, MITRE ATT&CK, MDN | Juice Shop, DVWA, WebGoat, Mutillidae |
| SOC / blue team | MITRE ATT&CK, Sigma, Elastic Detection Rules, Splunk Security Content, Microsoft Sentinel, NIST SP 800-61 | Atomic Red Team, Velociraptor, Wazuh, OSQuery, Hayabusa, Chainsaw |
| Offensive / VAPT | OWASP WSTG, OWASP Top 10, PortSwigger, CWE, CAPEC, Nmap | Juice Shop, crAPI, VAmPI, DVWA, Nuclei, ffuf, sqlmap, Burp/ZAP (authorized labs only) |
| Cloud / DevSecOps | AWS, Azure, Google Cloud, Kubernetes, Docker, Terraform, GitHub docs | Prowler, ScoutSuite, Trivy, Checkov, kube-bench, Falco, KICS |
| AI / GenAI | OpenAI, Anthropic, Google, Azure OpenAI, Hugging Face, LangChain, LlamaIndex, MCP | LangChain, LlamaIndex, AutoGen, CrewAI, MCP servers |
| AI security / agentic | OWASP GenAI, OWASP AI Exchange, MITRE ATLAS, NIST AI RMF, vendor safety docs | PyRIT, garak, Promptfoo, PurpleLlama, NeMo Guardrails, MCP servers |
| Interview prep | Official cert bodies, OWASP, MITRE, cloud docs, NVD for vuln examples | GeekGully roadmaps, labs, quizzes, salary and job pages |
| Assessments / quizzes | Course objectives, OWASP, MITRE, NIST, official cert objectives | Rule: every question maps to one measurable objective |
| News / threat explainers | Vendor advisories, CISA, CERT-In, NVD/CVE, official vendor blogs, primary research | Rule: separate verified facts from analysis; no speculation |
| Career / salary | DSCI, LinkedIn Skills on the Rise, NASSCOM, official job postings, government labour data, credible research | Rule: publish methodology, sample size, date range, assumptions, limitations |

## Approved non-GitHub sources

### Vulnerabilities, CVEs, advisories
- NVD https://nvd.nist.gov/ · search https://nvd.nist.gov/vuln/search · API https://nvd.nist.gov/developers/vulnerabilities
- CVE Program https://www.cve.org/
- CISA Advisories https://www.cisa.gov/news-events/cybersecurity-advisories
- CISA KEV https://www.cisa.gov/known-exploited-vulnerabilities-catalog
- CISA StopRansomware https://www.cisa.gov/stopransomware
- CERT-In vulnerability notes https://www.cert-in.org.in/s2cMainServlet?pageid=VULADV
- ENISA https://www.enisa.europa.eu/ · UK NCSC https://www.ncsc.gov.uk/ · Australian ACSC https://www.cyber.gov.au/
- CVSS https://www.first.org/cvss/ · EPSS https://www.first.org/epss/
- GitHub Advisories https://github.com/advisories · OSV https://osv.dev/
- Microsoft MSRC https://msrc.microsoft.com/update-guide
- Red Hat https://access.redhat.com/security/ · Ubuntu https://ubuntu.com/security/ · Debian https://security-tracker.debian.org/

### Standards, frameworks, defensive guidance
- NIST CSF https://www.nist.gov/cyberframework · CSRC pubs https://csrc.nist.gov/pubs
- NIST SP 800-53 https://csrc.nist.gov/pubs/sp/800/53/r5/upd1/final
- NIST SP 800-61 https://csrc.nist.gov/pubs/sp/800/61/r3/final
- NIST SP 800-63 https://csrc.nist.gov/pubs/sp/800/63/b/final
- NIST Privacy Framework https://www.nist.gov/itl/applied-cybersecurity/privacy-framework
- MITRE ATT&CK https://attack.mitre.org/ · D3FEND https://d3fend.mitre.org/ · CAR https://car.mitre.org/ · ATLAS https://atlas.mitre.org/
- OWASP https://owasp.org/ · Top 10 https://owasp.org/Top10/ · WSTG https://owasp.org/www-project-web-security-testing-guide/ · API Security https://owasp.org/API-Security/ · Cheat Sheets https://cheatsheetseries.owasp.org/ · ASVS https://owasp.org/www-project-application-security-verification-standard/ · K8s Top 10 https://owasp.org/www-project-kubernetes-top-ten/
- SANS https://www.sans.org/ · ISO/IEC 27001 https://www.iso.org/standard/27001 · 27002 https://www.iso.org/standard/27002

### AI, GenAI, agentic AI security
- OWASP GenAI Security Project https://genai.owasp.org/ · resources https://genai.owasp.org/resources/ · AI Red Teaming https://genai.owasp.org/initiatives/ai-red-teaming-initiative/
- OWASP AI Exchange https://owaspai.org/ · testing https://owaspai.org/docs/5_testing/
- NIST AI RMF https://www.nist.gov/itl/ai-risk-management-framework · resources …/resources · playbook …/ai-rmf-playbook
- NIST AI 100-1…100-7 under https://csrc.nist.gov/pubs/ai/100/{1..7}/final (⚠ confirm each number exists/title before citing)
- OpenAI docs https://platform.openai.com/docs/ · safety https://platform.openai.com/docs/guides/safety-strategies · prompting https://platform.openai.com/docs/guides/prompt-engineering
- Anthropic docs https://docs.anthropic.com/en/docs · prompt engineering …/build-with-claude/prompt-engineering/overview · agents and tools …/agents-and-tools (⚠ Anthropic docs have moved domains; confirm current URL)
- Google Gemini https://ai.google.dev/gemini-api/docs · safety https://ai.google.dev/gemini-api/docs/safety-settings
- Azure OpenAI https://learn.microsoft.com/en-us/azure/ai-services/openai/ · red teaming …/concepts/red-teaming
- Hugging Face https://huggingface.co/docs · LangChain https://python.langchain.com/docs/ · LlamaIndex https://docs.llamaindex.ai/
- MCP https://modelcontextprotocol.io/ · spec https://modelcontextprotocol.io/specification
- Prompting Guide https://www.promptingguide.ai/ (community; not primary evidence)

### Cloud, containers, DevSecOps
- AWS docs https://docs.aws.amazon.com/ · security https://aws.amazon.com/security/ · bulletins https://aws.amazon.com/security/security-bulletins/ · IAM https://docs.aws.amazon.com/IAM/latest/UserGuide/introduction.html · certs https://aws.amazon.com/certification/
- Azure security https://learn.microsoft.com/en-us/azure/security/ · Entra https://learn.microsoft.com/en-us/entra/identity/ · Defender https://learn.microsoft.com/en-us/defender/ · credentials https://learn.microsoft.com/en-us/credentials/
- Google Cloud security https://cloud.google.com/security · IAM https://cloud.google.com/iam/docs · certs https://cloud.google.com/learn/certification
- Kubernetes https://kubernetes.io/docs/ · security https://kubernetes.io/docs/concepts/security/ · checklist https://kubernetes.io/docs/concepts/security/security-checklist/
- Docker https://docs.docker.com/ · security https://docs.docker.com/engine/security/
- GitHub Actions security https://docs.github.com/en/actions/security-guides
- Terraform https://developer.hashicorp.com/terraform/docs · Ansible https://docs.ansible.com/ · Prometheus https://prometheus.io/docs/ · Grafana https://grafana.com/docs/ · Elastic https://www.elastic.co/guide/

### Web, API, network, offensive security
- MDN: https://developer.mozilla.org/en-US/docs/Web/Security · …/Web/HTTP/Headers · …/Web/HTTP/CSP · …/Web/HTTP/CORS · …/Web/HTTP/Cookies
- PortSwigger Academy https://portswigger.net/web-security · Burp docs https://portswigger.net/burp/documentation
- ZAP https://www.zaproxy.org/docs/ · Nmap book https://nmap.org/book/ · NSE https://nmap.org/nsedoc/
- Wireshark https://www.wireshark.org/docs/ · tcpdump https://www.tcpdump.org/manpages/
- CWE https://cwe.mitre.org/ · CAPEC https://capec.mitre.org/
- OpenSSL https://www.openssl.org/docs/ · curl https://curl.se/docs/ · man7 https://man7.org/linux/man-pages/ · Bash https://www.gnu.org/software/bash/manual/

### Certifications and career
- ISC2 https://www.isc2.org/ (CC …/certifications/cc, CISSP …/certifications/cissp)
- CompTIA Security+ https://www.comptia.org/certifications/security · CySA+ https://www.comptia.org/certifications/cybersecurity-analyst
- EC-Council CEH https://www.eccouncil.org/programs/certified-ethical-hacker-ceh/ · OffSec OSCP https://www.offsec.com/certifications/oscp/
- GIAC https://www.giac.org/certifications/ · CREST https://www.crest-approved.org/
- AWS Security Specialty https://aws.amazon.com/certification/certified-security-specialty/ · Microsoft AZ-500 https://learn.microsoft.com/en-us/credentials/certifications/azure-security-engineer/ · GCP Security Engineer https://cloud.google.com/learn/certification/cloud-security-engineer · CNCF https://www.cncf.io/training/certification/
- DSCI skilling landscape https://www.dsci.in/resource/content/indian-cyber-security-skilling-landscape-2025-2026 (⚠ confirm exact URL)
- CERT-In https://www.cert-in.org.in/ · MeitY https://www.meity.gov.in/ · RBI https://www.rbi.org.in/Scripts/NotificationUser.aspx · SEBI https://www.sebi.gov.in/
- Exam pricing, eligibility, objectives, and renewal rules change: always re-read the official page and mark "Requires verification" if not re-checked.

### Threat intelligence and research
Mandiant https://www.mandiant.com/resources/blog · Google Threat Intelligence https://cloud.google.com/blog/topics/threat-intelligence · Google TAG https://blog.google/threat-analysis-group/ · Microsoft Security Blog https://www.microsoft.com/en-us/security/blog/ · Unit 42 https://unit42.paloaltonetworks.com/ · CrowdStrike https://www.crowdstrike.com/en-us/blog/ · SentinelOne Labs https://www.sentinelone.com/labs/ · Wiz https://www.wiz.io/blog · Aqua https://www.aquasec.com/blog/ · Trend Micro https://www.trendmicro.com/en_us/research.html · Proofpoint https://www.proofpoint.com/us/blog · Volexity https://www.volexity.com/blog/ · Zscaler https://www.zscaler.com/blogs/security-research · Sophos https://news.sophos.com/en-us/ · Trellix https://www.trellix.com/blogs/research/ · Dark Reading https://www.darkreading.com/ · The Hacker News https://thehackernews.com/ (news outlets: secondary; confirm with vendor/CVE source)

## Approved GitHub repositories by content type

Official org repos over forks. Link README/docs/rule file, not the repo root.

### General security reference
- OWASP https://github.com/owasp · Cheat Sheets https://github.com/OWASP/CheatSheetSeries · WSTG https://github.com/OWASP/wstg · API Security https://github.com/OWASP/API-Security · ASVS https://github.com/OWASP/ASVS · Amass https://github.com/owasp-amass/amass · ZAP https://github.com/zaproxy/zaproxy · Dependency-Check https://github.com/dependency-check/DependencyCheck · Threat Dragon https://github.com/OWASP/threat-dragon
- Discovery-only Awesome lists: appsec https://github.com/paragonie/awesome-appsec · security https://github.com/sbilly/awesome-security · blue team https://github.com/fabacab/awesome-cybersecurity-blueteam · incident response https://github.com/meirwah/awesome-incident-response · threat detection https://github.com/0x4D31/awesome-threat-detection · CTF https://github.com/apsdehal/awesome-ctf · pentest https://github.com/enaqx/awesome-pentest

### Web and API security labs (isolated, authorized environments only)
- Juice Shop https://github.com/juice-shop/juice-shop · CTF https://github.com/juice-shop/juice-shop-ctf · companion guide https://github.com/juice-shop/pwning-juice-shop
- DVWA https://github.com/digininja/DVWA · Vulhub https://github.com/vulhub/vulhub · NodeGoat https://github.com/OWASP/NodeGoat · WebGoat https://github.com/WebGoat/WebGoat · Mutillidae II https://github.com/webpwnized/mutillidae
- crAPI https://github.com/OWASP/crAPI · VAmPI https://github.com/erev0s/VAmPI · vAPI https://github.com/roottusk/vapi · DVGA https://github.com/dolevf/Damn-Vulnerable-GraphQL-Application
- ⚠ Verify maintenance before recommending: WebGoat-Legacy, bWAPP (raesene fork), cytopia/dvwa Docker image, VulnerableWordPress.

### Offensive security and authorized testing
Educational/reference use only; authorized targets only; never publish ready-to-use attack steps
against real systems (see safety rules).
- PayloadsAllTheThings https://github.com/swisskyrepo/PayloadsAllTheThings · HackTricks https://github.com/carlospolop/hacktricks (+ cloud) · GTFOBins https://github.com/GTFOBins/GTFOBins.github.io · LOLBAS https://github.com/LOLBAS-Project/LOLBAS · WADComs https://github.com/JohnHammond/wadcoms
- Recon / scanning: Recon-ng https://github.com/lanmaster53/recon-ng · theHarvester https://github.com/laramies/theHarvester · Subfinder https://github.com/projectdiscovery/subfinder · httpx · Nuclei https://github.com/projectdiscovery/nuclei · Nuclei Templates https://github.com/projectdiscovery/nuclei-templates · Naabu · Katana · ffuf https://github.com/ffuf/ffuf · dirsearch https://github.com/maurosoria/dirsearch · wfuzz https://github.com/xmendez/wfuzz
- Exploitation helpers: sqlmap https://github.com/sqlmapproject/sqlmap · Commix · XSStrike · Dalfox · Caido · mitmproxy https://github.com/mitmproxy/mitmproxy · CyberChef https://github.com/gchq/CyberChef
- AD / post-exploitation (high-risk; teach detection and defense, not operation): Impacket https://github.com/fortra/impacket · NetExec https://github.com/Pennyw0rth/NetExec (⚠ CrackMapExec is the unmaintained predecessor — prefer NetExec) · BloodHound https://github.com/SpecterOps/BloodHound · Responder · Mimikatz · PowerSploit (⚠ archived) · Nishang. Do not produce operational credential-theft walkthroughs; cover the defensive side (detections, hardening, Sigma rules).

### Blue team, SOC, detection, IR
- Sigma https://github.com/SigmaHQ/sigma · Elastic detection rules https://github.com/elastic/detection-rules · Splunk Security Content https://github.com/splunk/security_content · Microsoft Sentinel https://github.com/Azure/Azure-Sentinel
- Atomic Red Team https://github.com/redcanaryco/atomic-red-team · Caldera https://github.com/mitre/caldera · Velociraptor https://github.com/Velocidex/velociraptor · Wazuh https://github.com/wazuh/wazuh · osquery https://github.com/osquery/osquery · Sysmon config https://github.com/SwiftOnSecurity/sysmon-config
- YARA https://github.com/VirusTotal/yara · YARA rules https://github.com/Yara-Rules/rules · capa https://github.com/mandiant/capa · FLOSS https://github.com/mandiant/flare-floss · REMnux https://github.com/REMnux/docker
- TheHive https://github.com/TheHive-Project/TheHive · MISP https://github.com/MISP/MISP · OpenCTI https://github.com/OpenCTI-Platform/opencti
- Hayabusa https://github.com/Yamato-Security/hayabusa · Chainsaw https://github.com/WithSecureLabs/chainsaw · KAPE (EricZimmerman) · DFIR-ORC https://github.com/dfir-orc/dfir-orc (⚠ supplied URL used google/ org; confirm) · LOKI/THOR Lite (⚠ LOKI superseded by Loki-RS; confirm)
- Discovery lists: awesome-yara https://github.com/InQuest/awesome-yara · awesome-soc https://github.com/cyb3rxp/awesome-soc
- Detection content rule: explain detection logic, required log source, false-positive risks, tuning.

### Cloud and container security
- Trivy https://github.com/aquasecurity/trivy · Checkov https://github.com/bridgecrewio/checkov · Terrascan https://github.com/tenable/terrascan (⚠ verify status) · tfsec https://github.com/aquasecurity/tfsec (⚠ folded into Trivy — prefer Trivy) · KICS https://github.com/Checkmarx/kics
- kube-bench https://github.com/aquasecurity/kube-bench (CIS cfg under /cfg) · kube-hunter (⚠ verify status) · kubeaudit https://github.com/Shopify/kubeaudit · Falco https://github.com/falcosecurity/falco · rules https://github.com/falcosecurity/rules
- Docker Bench https://github.com/docker/docker-bench-security · Prowler https://github.com/prowler-cloud/prowler · ScoutSuite https://github.com/nccgroup/ScoutSuite · Cloud Custodian https://github.com/cloud-custodian/cloud-custodian · Steampipe https://github.com/turbot/steampipe · CloudSploit (⚠ verify status)
- Discovery lists: awesome-cloud-security, awesome-k8s-security, awesome-aws-security, awesome-azure-security, awesome-gcp-security

### AI security, LLM security, agentic AI
- OWASP GenAI Security Project (GitHub org: verify exact org/repo — supplied `genai-security-project` ⚠) · OWASP LLM Top 10 https://github.com/OWASP/www-project-top-10-for-large-language-model-applications
- Microsoft PyRIT https://github.com/microsoft/PyRIT · NVIDIA garak https://github.com/NVIDIA/garak · Promptfoo https://github.com/promptfoo/promptfoo · PurpleLlama (Llama Guard) https://github.com/meta-llama/PurpleLlama · Guardrails AI https://github.com/guardrails-ai/guardrails · NeMo Guardrails https://github.com/NVIDIA/NeMo-Guardrails · Rebuff https://github.com/protectai/rebuff (⚠ archived/low activity — verify before recommending)
- Frameworks: LangChain https://github.com/langchain-ai/langchain · LlamaIndex https://github.com/run-llama/llama_index · AutoGen https://github.com/microsoft/autogen · CrewAI https://github.com/crewAIInc/crewAI · MCP https://github.com/modelcontextprotocol (spec: …/modelcontextprotocol · servers: …/servers)
- Discovery lists only: awesome-llm-security, awesome-ai-security (ottosulin, brinhosa), awesome-prompt-injection. "Prompt Injection Primer" (jthack/PIPE) and Gandalf (protectai) — ⚠ verify URL/exist before citing. PayloadsAllTheThings prompt-injection folder is reference only; never publish working jailbreaks for production systems.
- Usage rule: claims come from OWASP, MITRE ATLAS, NIST, vendor docs. PyRIT/garak/Promptfoo/Rebuff are testing tools for authorized environments only — explain intended use, limits, safety controls, responsible-testing boundaries.

### Programming, automation, developer learning
- Python https://github.com/python/cpython · The Algorithms Python https://github.com/TheAlgorithms/Python · JavaScript Algorithms https://github.com/trekhleb/javascript-algorithms · System Design Primer https://github.com/donnemartin/system-design-primer · Coding Interview University https://github.com/jwasham/coding-interview-university · freeCodeCamp https://github.com/freeCodeCamp/freeCodeCamp
- Discovery lists: awesome-python, awesome-python-security, public-apis, awesome-ai-agents (e2b-dev), awesome-generative-ai, awesome-interview-questions, awesome-courses. (Low-value for GeekGully: awesome-chatgpt-prompts, awesome-falsehood — avoid as citations.)

### Content, SEO, documentation
- Google Search Central https://developers.google.com/search/docs · Schema.org https://schema.org/ · schemaorg repo https://github.com/schemaorg/schemaorg · Lighthouse https://github.com/GoogleChrome/lighthouse · web.dev https://web.dev/
- ⚠ Verify before use: google/search-samples, mattcone/markdown-guide, awesome-readme/writing/technical-writing/seo list URLs.

## GitHub repository usage rules

1. Official repos over forks. 2. Check recent commits, releases, issues, maintenance before
recommending. 3. Never recommend solely because it appears in an Awesome list. 4. Vulnerable apps
only in isolated, authorized labs — say so. 5. Never turn offensive payloads into ready-to-use
attacks against real systems. 6. Detection content: logic, log source, false positives, tuning.
7. AI-security tools: intended use, limitations, safety controls, responsible-testing boundaries.
8. Prefer clear licenses, docs, active maintenance. 9. Official org repos over personal mirrors.
10. Link the README/doc/rule/template/release/example, not just the repo root.

## Worked example: `/learn/ai-security/prompt-injection/`

Primary sources: OWASP GenAI Security Project, OWASP AI Exchange testing page, MITRE ATLAS, NIST
AI RMF, OpenAI safety strategies, Anthropic prompt-engineering docs, MCP specification.
Supporting repos: PyRIT, garak, Promptfoo, PurpleLlama, NeMo Guardrails, MCP servers (Rebuff only
after maintenance check; Awesome Prompt Injection for discovery only).
Rule: OWASP/ATLAS/NIST/vendor docs support claims; tools are for authorized testing; Awesome lists
are never final citations. Juice Shop is the reference for safe web-security labs.

## For QA reviewers

Check every cited source against this library: is it primary, is the URL specific, does it support
the claim, is it current? A citation to an Awesome list, a repo root, or an unverified URL for a
factual claim is a revision item. A claim you cannot verify → "Requires human verification" with
exactly what to check.
