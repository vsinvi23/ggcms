# Dependency Audit

Date: 2026-10-22. Tools: govulncheck (binary mode on a built `cmd/server`, because source mode was blocked by concurrent in-flight edits), `npm audit --omit=dev`.

## Go backend (gg-cms/backend/go-cms)

Bumped in go.mod (build passes; `go.mod` `go` directive unchanged at 1.25.0):

| Module | From | To |
|---|---|---|
| github.com/gin-gonic/gin | v1.9.1 | v1.10.1 |
| github.com/golang-jwt/jwt/v5 | v5.2.1 | v5.2.2 |
| golang.org/x/crypto | v0.25.0 | v0.45.0 |
| golang.org/x/net | v0.24.0 | v0.47.0 |
| golang.org/x/text | v0.16.0 | v0.39.0 |
| github.com/jackc/pgx/v5 | v5.5.5 | v5.9.2 |
| go.mongodb.org/mongo-driver | v1.16.1 | v1.17.7 |

Tests (`go test ./internal/... ./pkg/... ./migrations/... -short`): category, cms, importer, personalization, settings, topic, postgres repository, storage, graphql, migrations pass. Failures remaining are not from the bumps: `internal/interfaces/http/middleware/logger.go:30` regexp `[^"\]` fails to compile at init (panics every package importing middleware; should be `[^"\]`), plus in-flight compile errors in other agents' areas at the time of the run.

Still open after bumps (govulncheck, Go 1.25.4 toolchain):

- Standard library (net/http, crypto/tls, crypto/x509, net/url, encoding/xml/asn1, net/mail, html/template, archive/zip, os): fixed in Go 1.25.13 / 1.26.x. Action: build with the latest Go patch release (Dockerfile uses `golang:1.25-alpine`, which tracks the latest 1.25.x; rebuild the image, and upgrade the local toolchain).
- golang.org/x/net v0.47.0 (GO-2026-6609..6617): fixed in v0.60.0, which requires go >= 1.26.0. Bump together with moving `go` to 1.26 and `golang:1.26-alpine`.
- golang.org/x/text: v0.39.0 applied; GO-2026-6629 needs v0.41.0 (go 1.26 requirement likely).

Re-run `govulncheck ./...` once the tree compiles cleanly; it is not installed by default (`go install golang.org/x/vuln/cmd/govulncheck@latest`).

## Frontend (gg-cms/frontend/react-ui), `npm audit --omit=dev`

18 vulnerabilities (2 low, 4 moderate, 12 high). Not changed (fixes involve breaking majors; needs UI regression testing):

- Direct: tailwindcss (high; fix tailwindcss@4.3.3, major), mermaid (high), react-router-dom (moderate; fix 7.18.4, major), dompurify (low).
- Transitive: braces, micromatch, chokidar, fast-glob (via tailwindcss), chevrotain family and lodash-es (via mermaid), follow-redirects, source-map-js, postcss-nested, postcss-selector-parser, katex, react-router.
- Safe first step: `npm audit fix` (non-breaking), then evaluate mermaid and react-router-dom upgrades. tailwindcss is a build-time tool and should move to devDependencies.
