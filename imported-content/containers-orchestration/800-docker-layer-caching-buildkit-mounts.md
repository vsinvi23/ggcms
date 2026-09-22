# Docker Layer Caching: Structuring Multi-Stage Dockerfiles and BuildKit Cache Mounts

### The Problem: Monolithic, Unoptimized Image Builds

Building container images repeatedly during local development or CI/CD pipelines can be agonizingly slow. Common anti-patterns include copying the entire source directory before fetching dependencies and combining build tools with runtime execution in a single stage. This results in cache invalidation for the most expensive operations (like `npm install` or `go mod download`) whenever a single line of application code changes. Furthermore, the resulting images are bloated with compilers, linters, and source files.

### The Solution: Multi-Stage Builds and BuildKit

Optimizing Dockerfiles requires a two-pronged approach:
1.  **Multi-Stage Builds:** Separate the build environment from the runtime environment.
2.  **BuildKit Cache Mounts:** Retain package manager caches across builds without bloating the final image layers.

### Architecture: Build Cache and Layer Ordering

The key to layer caching is ordering instructions from least frequently changed to most frequently changed. Package definition files (`package.json`, `go.mod`) change less often than application source code.

```text
+-------------------+       +--------------------+
|    Base Stage     |       |    Cache Mount     |
| (OS + Build Tools)|       | (e.g., ~/.npm,     |
+---------+---------+       |  ~/.cache/go-build)|
          |                 +---------+----------+
          |                           |
+---------v---------+       +---------v----------+
|  Dependency Sync  | <-----| BuildKit --mount   |
| (COPY package.json|       | retrieves packages |
|  -> npm install)  |       | from local cache   |
+---------+---------+       +--------------------+
          |
+---------v---------+
| Source Code Sync  | (Invalidates cache ONLY if
| (COPY src/ ./)    |  src/ files change)
+---------+---------+
          |
+---------v---------+       +--------------------+
|   Compile/Build   |       |   Runtime Stage    |
| (npm run build)   | ----> | (OS + Compiled App)|
+-------------------+       +--------------------+
```

### Implementation: Advanced Dockerfile Caching

To utilize BuildKit features like `--mount=type=cache`, you must ensure BuildKit is enabled (`DOCKER_BUILDKIT=1 docker build ...` or using Docker Desktop defaults).

#### Example: Node.js with BuildKit Cache

In a standard Node.js build, `npm install` can take minutes. If we change a `.js` file, we don't want to re-run `npm install`.

```dockerfile
# syntax=docker/dockerfile:1.4
FROM node:20-alpine AS builder

WORKDIR /app

# 1. Copy ONLY package definitions first
COPY package.json package-lock.json ./

# 2. Use BuildKit cache mount for npm
# This prevents downloading packages from the internet if they exist in the BuildKit cache,
# even if the package.json layer is invalidated (e.g., adding a new dependency).
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# 3. Copy source code (changes frequently)
COPY tsconfig.json ./
COPY src/ ./src/

# 4. Build the application
RUN npm run build

# --- Runtime Stage ---
FROM node:20-alpine AS runner
WORKDIR /app

# Copy only production dependencies and built assets
COPY --from=builder /app/package.json /app/package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev

COPY --from=builder /app/dist ./dist

# Run as non-root user
USER node
CMD ["node", "dist/index.js"]
```

#### Example: Go with BuildKit Cache

Go builds benefit massively from caching the module downloads and the build cache itself.

```dockerfile
# syntax=docker/dockerfile:1.4
FROM golang:1.22-alpine AS builder
WORKDIR /src

# Cache module downloads
COPY go.mod go.sum ./
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download

# Copy source
COPY . .

# Cache the build outputs
RUN --mount=type=cache,target=/go/pkg/mod \
    --mount=type=cache,target=/root/.cache/go-build \
    CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /bin/server ./cmd/server

# --- Runtime Stage ---
FROM scratch AS runner
COPY --from=builder /bin/server /server
ENTRYPOINT ["/server"]
```

### Operational Considerations

*   **Cache Targets:** Ensure the `target` path in `--mount=type=cache` exactly matches where your package manager stores its global cache (e.g., `/root/.npm`, `/go/pkg/mod`, `/root/.cache/pip`).
*   **Security:** Avoid injecting secrets via `ENV` or `ARG`. Use `--mount=type=secret` for SSH keys or API tokens needed during the build phase; these are never persisted in the final image layers.
*   **CI/CD:** In automated pipelines (like GitHub Actions), BuildKit cache mounts are local to the runner node. You must export/import the BuildKit cache using `--cache-to` and `--cache-from` to persist it across ephemeral CI runners.
