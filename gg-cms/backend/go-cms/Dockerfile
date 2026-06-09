# ── Build stage ──────────────────────────────────────────────────────────────
FROM golang:1.25-alpine AS builder

WORKDIR /app

RUN apk add --no-cache git ca-certificates tzdata

COPY go.mod go.sum ./
RUN go mod download

COPY . .

RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -a -installsuffix cgo -ldflags="-w -s" -o server ./cmd/server

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM alpine:3.20

RUN apk --no-cache add ca-certificates tzdata

WORKDIR /app

COPY --from=builder /app/server .
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/.env.example ./.env.example

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:8080/api/health || exit 1

CMD ["./server"]
