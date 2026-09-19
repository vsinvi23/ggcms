# GeekGully Content Repository (`content/`)

Welcome to the **GeekGully Content Repository**. This folder is parallel to `docs/` and serves as the structured staging and authoring ground for all educational content (Articles, Courses, Guides, Reference Cards, Cheat Sheets) before ingestion into `gg-cms`.

---

## 📁 Taxonomy & Folder Architecture

The folder structure directly mirrors the 5 top-level domains and 13 subcategories established in [TAXONOMY_ARCHITECTURE_DECISION.md](file:///Users/vivek/work/Serenyax/Product/Sandbox/ggcms/docs/TAXONOMY_ARCHITECTURE_DECISION.md):

```text
content/
├── README.md
├── GEEKGULLY_CONTENT_CATALOG_AND_BACKEND_INTEGRATION_BLUEPRINT.md
├── import_manifest.json
├── scripts/
│   └── multiagent_content_runner.py
├── software-engineering/
│   ├── programming-languages/
│   ├── backend-and-apis/
│   └── software-design/
├── cloud-and-infrastructure/
│   ├── cloud-platforms/
│   ├── containers-and-orchestration/
│   └── infrastructure-as-code/
├── cybersecurity/
│   ├── identity-and-access/
│   ├── pki-and-cryptography/
│   └── appsec-and-threats/
├── data/
│   ├── databases/
│   └── data-engineering/
└── ai-and-machine-learning/
    ├── machine-learning-foundations/
    └── generative-ai/
```

---

## 🏷️ Category & Slug Mapping Table

| Domain Directory | Subcategory Folder | `categorySlug` | Target Topics |
| :--- | :--- | :--- | :--- |
| `software-engineering/` | `programming-languages/` | `programming-languages` | `go`, `python`, `javascript`, `typescript` |
| `software-engineering/` | `backend-and-apis/` | `backend-and-apis` | `rest`, `graphql`, `grpc`, `microservices`, `message-queues` |
| `software-engineering/` | `software-design/` | `software-design` | `object-oriented-programming`, `concurrency`, `design-patterns` |
| `cloud-and-infrastructure/` | `cloud-platforms/` | `cloud-platforms` | `aws`, `azure`, `gcp` |
| `cloud-and-infrastructure/` | `containers-and-orchestration/` | `containers-and-orchestration` | `docker`, `kubernetes` |
| `cloud-and-infrastructure/` | `infrastructure-as-code/` | `infrastructure-as-code` | `terraform`, `ansible` |
| `cybersecurity/` | `identity-and-access/` | `identity-and-access` | `oauth-2`, `openid-connect`, `jwt`, `saml` |
| `cybersecurity/` | `pki-and-cryptography/` | `pki-and-cryptography` | `tls`, `x509-certificates`, `public-key-infrastructure` |
| `cybersecurity/` | `appsec-and-threats/` | `appsec-and-threats` | `owasp-top-10`, `threat-modeling`, `zero-trust-architecture` |
| `data/` | `databases/` | `databases` | `sql`, `postgresql`, `mongodb` |
| `data/` | `data-engineering/` | `data-engineering` | `data-modeling` |
| `ai-and-machine-learning/` | `machine-learning-foundations/` | `machine-learning-foundations` | `machine-learning` |
| `ai-and-machine-learning/` | `generative-ai/` | `generative-ai` | `large-language-models`, `retrieval-augmented-generation`, `prompt-engineering` |

---

## ⚡ Multi-Agent Automation & Bulk Import

To run automated schema validation and multi-agent content packaging:

```bash
# Validate frontmatter and content structure across all files
python3 content/scripts/multiagent_content_runner.py --validate

# Package all content into an importable ZIP archive for gg-cms
python3 content/scripts/multiagent_content_runner.py --package
```

The output package `content/dist/ggcms_content_pack.zip` can be directly uploaded to the **Bulk Import UI** (`/dashboard/import`) or posted to `/api/import/preview` & `/api/import/confirm`.

---

## 🌐 Clean Frontend Routes & Backend API Endpoints

- **Frontend UI Routes**:
  - Articles: `/articles`
  - Courses: `/courses`
  - Learning Paths: `/learning-paths`
  - Topics: `/topics`

- **Backend REST API Endpoints**:
  - `GET /api/public/articles`
  - `GET /api/public/courses`
  - `GET /api/learning-paths`
  - `GET /api/categories`
  - `GET /api/topics`
