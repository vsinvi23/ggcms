---
title: "Static Go Binaries in Distroless Images: A Multi-Stage Build Walkthrough"
description: "Compiling a statically-linked Go binary with CGO disabled and packaging it into a shell-less distroless image, cutting a production image from 850MB to under 15MB and eliminating the interactive-shell attack surface."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "docker"
  - "golang"
  - "multi-stage-builds"
  - "distroless"
  - "static-binary"
  - "cgo"
---

# Static Go Binaries in Distroless Images: A Multi-Stage Build Walkthrough

A Go HTTP service ships in production as `golang:1.22-alpine`, because that's what compiled the binary and nobody removed it afterward. The image is 850MB and contains a full compiler toolchain, `git`, and `apk`. An attacker who gets remote code execution in the application doesn't need to bring any tools with them — the image already has everything needed to download a second-stage payload, inspect the network, or attempt privilege escalation.

Go is one of the few languages where this problem has a near-total fix: it can produce a single, statically-linked binary with zero runtime dependency on the host's shared libraries, which means the production image needs nothing but that one file (plus CA certs and timezone data).

---

## Why Go specifically enables this

With `CGO_ENABLED=0`, the Go linker resolves everything — including what would otherwise be dynamic links to `libc` — statically into the binary itself. There's no `ldd` output, no shared-library version dependency on the host OS, and critically, no requirement for a shell, package manager, or C runtime in the final image.

That means the production image can be **distroless** — Google's minimal base images containing only an application's baseline runtime needs (CA certificates, timezone database) and explicitly no shell, no package manager, no debugger.

```text
+-------------------------------------------------------------+
| STAGE 1: BUILDER (golang:1.22-alpine)                       |
| - Contains: Go compiler, git, SSL certs, source code         |
| - Action: compile a static binary (CGO_ENABLED=0)             |
+-------------------------------------------------------------+
                               |
                Copies ONLY    |
                the binary     |
                               v
+-------------------------------------------------------------+
| STAGE 2: RUNTIME (gcr.io/distroless/static-debian12)          |
| - Contains: no shell, no package manager, no toolchain        |
| - Includes: minimal system libs, CA certificates              |
| - Security: runs as non-root user (UID 65532)                 |
+-------------------------------------------------------------+
```

---

## Implementation

### The application

```go
package main

import (
	"fmt"
	"net/http"
)

func main() {
	http.HandleFunc("/healthz", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		fmt.Fprintf(w, "OK")
	})

	fmt.Println("Server starting on port 8080...")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		panic(err)
	}
}
```

### The multi-stage Dockerfile

```dockerfile
# --- Stage 1: Build ---
FROM golang:1.22.2-alpine3.19 AS builder

RUN apk add --no-cache git ca-certificates tzdata

WORKDIR /app
COPY go.mod ./
# RUN go mod download   # uncomment once external modules are added
COPY . .

# CGO_ENABLED=0: strip all dynamic libc linkage -> fully static binary
# GOOS/GOARCH: pin the target platform explicitly
# -ldflags="-w -s": strip debug symbols and DWARF tables to shrink the binary
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build \
    -ldflags="-w -s" \
    -o /go/bin/webserver .

# --- Stage 2: Runtime ---
FROM gcr.io/distroless/static-debian12:latest-amd64

# CA certs and timezone data are the only OS-level dependencies a Go binary
# typically needs (for outbound TLS and time.LoadLocation, respectively)
COPY --from=builder /usr/share/zoneinfo /usr/share/zoneinfo
COPY --from=builder /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/

COPY --from=builder /go/bin/webserver /webserver

# distroless's built-in nonroot identity — UID/GID 65532
USER 65532:65532

EXPOSE 8080
ENTRYPOINT ["/webserver"]
```

---

## Verifying the result

### Size reduction

```bash
docker build -t my-go-app:distroless .
docker images | grep my-go-app
```

The final distroless image lands around 10-15MB, compared to roughly 850MB for the builder stage alone and ~150MB for a single-stage Alpine-based equivalent — the difference between a build environment and a runtime environment is almost the entire image.

### Confirming there's no shell to exploit

```bash
docker run -d --name test-app -p 8080:8080 my-go-app:distroless
docker exec -it test-app /bin/sh
```

```text
OCI runtime exec failed: exec failed: container_linux.go: starting container process caused:
exec: "/bin/sh": stat /bin/sh: no such file or directory: unknown
```

There is no interactive shell to gain, even with a successful `docker exec` attempt — the most common post-exploitation step (spawn a shell, look around) is closed off structurally, not by a security policy that could be misconfigured.

---

## Key takeaways

1. `CGO_ENABLED=0` is what makes a Go binary genuinely dependency-free — verify it's set before assuming a build is "static."
2. Only copy what the runtime actually needs across stages: for a typical Go service that's the binary, CA certs, and timezone data — nothing else.
3. Distroless's `nonroot`/numeric-UID variants remove both the shell *and* root execution in one base image choice.
4. Confirm the hardening empirically (`docker exec ... /bin/sh` should fail) rather than trusting the Dockerfile's intent.
