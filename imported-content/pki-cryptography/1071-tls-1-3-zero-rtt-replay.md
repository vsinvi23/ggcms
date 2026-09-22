# TLS 1.3 0-RTT: The Dangers of Early Data Replay Attacks and Non-Idempotent APIs

## The Problem: Speed at the Cost of Replay Protection

TLS 1.3 introduced **0-RTT (Zero Round-Trip Time)** connection resumption to eliminate the handshake latency overhead for returning visitors. By caching session keys (using a Pre-Shared Key, or PSK, ticket derived from a previous session), the client can encrypt application payload data—called **Early Data**—and send it alongside the initial `ClientHello`.

While this provides massive speed boosts, it introduces a severe cryptographic vulnerability: **Early Data lacks replay protection.**

An eavesdropping middleman can capture the client's initial 0-RTT flight (`ClientHello` + `Early Data` packet) and replay it to the server. Because the server has no context of the interception, it decrypts the replayed flight, establishes a valid TLS session, and passes the duplicate application payload to the backend API. If the payload requests a non-idempotent state change (e.g., `/api/v1/billing/charge` or `/api/v1/queue/job`), the action is processed twice, leading to financial or logic-breaking exploitation.

---

## The Replay Attack Vector

```
[ Client ]                   [ Attacker ]                   [ Server ]
    |                              |                            |
    |-- (1) ClientHello ---------  |                            |
    |       + Early Data (POST)  |                            |
    |       ====================>| (Intercepts packet)        |
    |                              |                            |
    |                              |-- (2) ClientHello -------->|
    |                              |       + Early Data (POST)  |
    |                              |                            | (Processes POST,
    |                              |                            |  charges wallet!)
    |                              |<-- (3) ServerHello --------|
    |                              |        + Finished          |
    |                              |                            |
    |                              |-- (4) Replay ClientHello ->|
    |                              |       + Early Data (POST)  |
    |                              |       ====================>| (Processes POST AGAIN,
    |                              |                            |  double charge!)
    |                              |<-- (5) ServerHello --------|
    |                              |        + Finished          |
```

Because the cryptographic resumption handshake relies on a static PSK ticket, the server cannot distinguish between the legitimate client sending early data and an attacker playing a bit-for-bit capture of that identical packet.

---

## Technical Mitigations

To safely deploy TLS 1.3 0-RTT, architectural mitigations must be layered across the transport and application tiers:

1. **Transport Layer: Single-Use Tickets**: The server invalidates the PSK session ticket immediately upon first use. This requires tight synchronization across distributed server nodes, which can be difficult to scale globally.
2. **Transport Layer: Client Hello Time-Windows**: The server records the client's local time (embedded in the ticket) and compares it with the server's wall-clock time. If the difference exceeds a small window (e.g., $\pm 2$ seconds), the ticket is rejected.
3. **Application Layer: HTTP Idempotency Enforcement**: The application proxy must reject non-idempotent HTTP methods (e.g., `POST`, `PUT`, `DELETE`, `PATCH`) carried within TLS Early Data. It should only permit safe, idempotent operations (like `GET` or `HEAD`).

---

## Go Implementation: Replay-Resistant API Gateway Middleware

Below is a robust Go web-server implementation containing a custom middleware. It inspects the TLS connection state and incoming HTTP headers to ensure that TLS 1.3 early data is never permitted to access non-idempotent backend endpoints.

```go
package main

import (
	"crypto/tls"
	"fmt"
	"net/http"
)

// IdempotencyMiddleware guards endpoints against non-idempotent TLS 1.3 0-RTT early data.
func IdempotencyMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// 1. Inspect TLS Connection State
		if r.TLS != nil {
			// RFC 8446: Checking for early data usage
			// Go's crypto/tls sets DidResume to true and exposes early data status.
			// Standard proxies also inject an "Early-Data" header (RFC 8470).
			isEarlyDataHeader := r.Header.Get("Early-Data") == "1"
			
			// If we detect early data, we must strictly enforce idempotency
			if isEarlyDataHeader || (r.TLS.DidResume && isTLSConnectionEarly(r.TLS)) {
				switch r.Method {
				case http.MethodGet, http.MethodHead, http.MethodOptions:
					// Safe and idempotent methods are allowed to execute
					w.Header().Set("X-TLS-0RTT-Safe", "true")
				default:
					// Non-idempotent method (POST, PUT, DELETE) detected in 0-RTT flight!
					// RFC 8470 Section 5.2: Server must reject with 425 Too Early
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(http.StatusTooEarly)
					fmt.Fprintf(w, `{"error": "Too Early", "message": "Non-idempotent requests are rejected in TLS 1.3 Early Data flights to prevent replay attacks."}`)
					return
				}
			}
		}

		next.ServeHTTP(w, r)
	})
}

// isTLSConnectionEarly implements platform-specific heuristic check for active 0-RTT
func isTLSConnectionEarly(cs *tls.ConnectionState) bool {
	// Under advanced setups, check if HandshakeComplete is deferred
	// and cipher suite indicates resumption without completed 1-RTT flight.
	return cs.CipherSuite == tls.TLS_AES_128_GCM_SHA256 && !cs.HandshakeComplete
}

func handleCheckout(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	fmt.Fprintf(w, `{"status": "success", "charge_processed": true}`)
}

func main() {
	mux := http.NewServeMux()
	
	// Secure transactional endpoint protected by the middleware
	mux.Handle("/api/v1/checkout", IdempotencyMiddleware(http.HandlerFunc(handleCheckout)))

	// Configure TLS 1.3 server parameters
	tlsConfig := &tls.Config{
		MinVersion: tls.VersionTLS13,
		// Enable TLS 1.3 Session Ticket/Resumption (PSK)
		SessionTicketsDisabled: false,
	}

	server := &http.Server{
		Addr:      ":8443",
		Handler:   mux,
		TLSConfig: tlsConfig,
	}

	fmt.Println("Secure HTTPS Gateway listening on :8443 with 0-RTT replay mitigation active...")
	// Log error if server fails to start (requires cert/key files)
	_ = server.ListenAndServeTLS("server.crt", "server.key")
}
```

---

## Architectural Guidelines for RFC 8470 Compliance

When integrating reverse proxies (like Cloudflare, NGINX, or HAProxy) with backend applications:

1. **Downstream Headers**: Standard reverse proxies strip or forward the `Early-Data: 1` header. Ensure your backend parses this header as a source of truth.
2. **HTTP 425 Retry Protocol**: When your application issues a `425 Too Early` response, the client's user-agent (browser or SDK) must understand to automatically retry the request after completing the 1-RTT handshake, ensuring no user-perceived downtime.
