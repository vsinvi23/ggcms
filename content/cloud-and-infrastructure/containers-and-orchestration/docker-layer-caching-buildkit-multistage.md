---
title: "Docker Layer Caching: Instruction Ordering, Multi-Stage Builds, and BuildKit Cache Mounts"
description: "How Docker's layer cache invalidation actually works, the ordering rule that prevents dependency re-installation on every commit, and BuildKit cache mounts that survive across builds without bloating the final image."
type: "ARTICLE"
categorySlug: "containers-orchestration"
articleType: "GUIDE"
tags:
  - "docker"
  - "buildkit"
  - "layer-caching"
  - "multi-stage-builds"
  - "dockerfile"
  - "ci-cd"
---

# Docker Layer Caching: Instruction Ordering, Multi-Stage Builds, and BuildKit Cache Mounts

A team's CI pipeline takes 6 minutes to build a Node.js image on every commit — even a one-line change to a log message. `npm ci` re-downloads the entire dependency tree from the registry every single time, because the `Dockerfile` copies the whole source directory, including `package.json`, in a single `COPY . .` before installing anything. Any file change anywhere in the repo invalidates that layer, and everything after it — including the expensive install step — reruns from scratch.

The fix costs nothing at runtime and is purely about instruction *ordering* plus one BuildKit feature.

---

## How the cache actually invalidates

Docker builds an image by executing `Dockerfile` instructions sequentially, and each instruction produces an immutable, read-only layer. Before running an instruction, Docker checks: has this exact instruction run before against this exact parent layer? For `COPY`/`ADD` it checksums the copied files; for `RUN` it compares the command string itself.

**The rule that matters:** the moment one layer is invalidated, *every layer after it* is invalidated too, regardless of whether those later instructions' own inputs changed.

```text
File modified: index.js
       |
       v
COPY package.json .   --> unchanged (CACHE HIT)
       |
RUN npm install        --> unchanged (CACHE HIT)
       |
COPY . .                --> changed  (CACHE INVALIDATED)
       |
RUN npm run build       --> CACHE INVALIDATED (reruns even though build logic didn't change)
```

Compare that to the anti-pattern — copying everything before installing:

```text
File modified: index.js
       |
       v
COPY . .              --> changed (CACHE INVALIDATED)
       |
RUN npm install         --> CACHE INVALIDATED (re-downloads hundreds of MBs, every commit)
```

```dockerfile
# BAD: source code copied before dependency manifest
FROM python:3.11-slim
WORKDIR /app
COPY . .
RUN pip install -r requirements.txt   # invalidated by ANY source file change
CMD ["python", "app.py"]
```

```dockerfile
# GOOD: dependency manifest copied first, isolated from source churn
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt   # cache hit on 99% of builds
COPY . .
CMD ["python", "app.py"]
```

**The ordering rule of thumb**, from least to most frequently changed:

1. `FROM` base image
2. System package installation (`apt-get`, `apk`)
3. Dependency manifests (`package.json`, `go.mod`, `requirements.txt`)
4. Dependency installation (`npm ci`, `go mod download`, `pip install`)
5. Application source code (`COPY . .`)
6. Build/compile step

---

## Multi-stage builds: separating build tools from the runtime

Multi-stage builds don't speed up the cache directly, but they solve the companion problem: a build stage full of compilers, headers, and package managers should never ship to production. Only the compiled artifact crosses into the final image.

```dockerfile
# Stage 1: Build environment
FROM golang:1.21 AS builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o /bin/myapp

# Stage 2: Minimal runtime
FROM alpine:latest
RUN apk --no-cache add ca-certificates
WORKDIR /root/
COPY --from=builder /bin/myapp .
CMD ["./myapp"]
```

Combine that principle with strategic `RUN` grouping — every `RUN` is a layer, and splitting `apt-get update` from `apt-get install` across layers risks a stale package index being cached independently of the install step:

```dockerfile
RUN apt-get update && apt-get install -y \
    curl \
    git \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*
```

---

## BuildKit cache mounts: caching the package manager store itself

Instruction ordering solves cache invalidation *within* a single build's lifetime, but the classic Dockerfile approach still discards the package manager's own download cache between builds unless it happens to be reused via a cached layer. **BuildKit's `--mount=type=cache`** solves this differently: it mounts a cache directory that *persists across build invocations*, independent of layer caching, so even a fully invalidated `RUN npm ci` layer can still avoid re-downloading packages from the network.

Requires `# syntax=docker/dockerfile:1.4` and BuildKit enabled (`DOCKER_BUILDKIT=1`, on by default in current Docker Desktop).

### Node.js example

```dockerfile
# syntax=docker/dockerfile:1.4
FROM node:20-alpine AS builder
WORKDIR /app

# 1. Copy only package definitions first
COPY package.json package-lock.json ./

# 2. BuildKit cache mount survives even if package.json changes and the layer
#    itself is invalidated — npm still finds packages in the persisted cache dir
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# 3. Source code changes frequently — isolated below the install step
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# --- Runtime stage ---
FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/index.js"]
```

### Go example

```dockerfile
# syntax=docker/dockerfile:1.4
FROM golang:1.22-alpine AS builder
WORKDIR /src

COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

COPY . .

# Cache both the module store and the compiler's build cache
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/server ./cmd/server

FROM scratch AS runner
COPY --from=builder /bin/server /server
ENTRYPOINT ["/server"]
```

### Complete example: distroless runtime with cache-mounted dependency stage

```dockerfile
FROM node:20.11.0-alpine AS deps
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --only=production

FROM node:20.11.0-alpine AS builder
WORKDIR /usr/src/app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
COPY . .
RUN npm run build

FROM gcr.io/distroless/nodejs20-debian12 AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY --from=builder /usr/src/app/dist ./dist
COPY --from=builder /usr/src/app/package.json ./package.json
EXPOSE 3000
USER 65532
CMD ["dist/index.js"]
```

---

## Operational notes

- **Cache target paths must match the tool's real cache location** — `/root/.npm`, `/go/pkg/mod`, `/root/.cache/pip`, `/root/.cache/go-build`. A typo silently no-ops the cache mount rather than erroring.
- **Never bake secrets into `ENV`/`ARG`** for build-time credentials (SSH keys, registry tokens) — those persist in image layer history. Use `RUN --mount=type=secret,id=mysecret` instead; secrets mounted this way are never written to any layer.
- **`.dockerignore` is not optional.** Without one, an unrelated change to `.git`, `node_modules`, or a log file still invalidates `COPY . .`. At minimum:

```ignore
node_modules
dist
.git
.github
*.log
Dockerfile
.dockerignore
```

- **In CI, BuildKit cache mounts are local to the runner node by default** and vanish on ephemeral runners. Persist them across runs with `--cache-to`/`--cache-from` (registry- or local-directory-backed) or the cache is effectively cold on every CI run regardless of Dockerfile structure.

---

## Key takeaways

1. Order Dockerfile instructions from least- to most-frequently-changed; dependency manifests before source code is the single highest-leverage change.
2. A single cache-invalidated layer invalidates everything after it — this is why ordering, not just caching in general, is the mechanism that matters.
3. Multi-stage builds remove build tooling from the shipped image; `--mount=type=cache` removes the *download* cost even when layers do invalidate.
4. CI runners are typically ephemeral — BuildKit cache mounts need explicit `--cache-to`/`--cache-from` export to actually persist between pipeline runs.
