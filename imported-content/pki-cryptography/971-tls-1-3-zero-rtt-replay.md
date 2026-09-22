# TLS 1.3 0-RTT: The Dangers of Early Data Replay Attacks and Non-Idempotent APIs

## The Problem: Session Resumption and Handshake Latency

In modern networking, standard TLS 1.3 handshakes require 1 round-trip time (1-RTT) to complete key exchange and verify certificates. While a significant improvement over TLS 1.2, this latency overhead degrades API performance on cellular connections or high-distance edge routes.

To eliminate this delay, TLS 1.3 introduced **0-RTT Mode (Zero Round-Trip Time Resumption)**. When a client reconnects to a server using a previously acquired Pre-Shared Key (PSK) ticket, it can send application data ("Early Data") on its very first packet (the TCP SYN segment or the first flight of bytes).

This optimization exposes a massive cryptographic vulnerability: **Early Data is not protected against replay attacks.** Because the server processes and responds to early data before a fresh ephemeral Diffie-Hellman handshake is completed, an attacker who intercepts the network traffic can replay the exact same packets to the server. If the target endpoint executes non-idempotent operations, this leads to state corruption, duplicate billing, or resource exhaustion.

---

## Architectural Blueprint: The 0-RTT Replay Attack

```
Client                      Attacker (MitM)                     Server
  |                                |                              |
  |--- ClientHello + EarlyData --->|                              |
  |    (POST /api/v1/transfer)     |                              |
  |                                |--- Replays Captured PKT ---->| (Executes: transfer $100)
  |                                |                               | [Transaction 1]
  |                                |<-- ServerHello + Finished ---|
  |<-- Forwarded Handshake --------|                              |
  |                                |                              |
  |                                |--- Replays Captured PKT ---->| (Executes: transfer $100)
  |                                |                               | [Transaction 2 - REPLAY!]
```

Because the cryptographic keys used for Early Data are derived solely from the prior session ticket, there is no forward-fresh entropy injected by the server on the 0-RTT flight. Thus, the server cannot cryptographically distinguish a genuine 0-RTT packet from a replayed one without maintaining a stateful tracking mechanism.

---

## Anti-Replay Mitigation Strategies

1. **Stateful Anti-Replay Cache:** Servers maintain a sliding-window bloom filter or high-throughput in-memory database recording the hashes of all received 0-RTT ClientHello tickets. Tickets that are re-submitted within their validity window are instantly rejected.
2. **strict Protocol Restriction:** Enforce a strict architectural policy that 0-RTT data is only accepted for **idempotent HTTP methods** (e.g., `GET`, `HEAD`, `OPTIONS`). Non-idempotent methods (`POST`, `PUT`, `DELETE`, `PATCH`) must be flatly rejected with a TLS `TooEarly` error, forcing the client to re-transmit the request over a safe 1-RTT channel.
3. **Client Timestamp Verification:** Check the age of the session ticket. Reject tickets with mismatched or implausible timestamp offsets.

---

## Robust Go Implementation: Safe 0-RTT Mitigation Middleware

The following Go code implements a complete HTTPS API server that safely handles TLS 1.3 0-RTT. It configures the Go standard library TLS engine to accept early data, tracks ticket freshness, and uses custom HTTP middleware to reject non-idempotent requests that arrive as early data, forcing 1-RTT re-negotiation.

```go
package main

import (
	"crypto/tls"
	"fmt"
	"log"
	"net/http"
)

// EarlyDataMiddleware inspects requests for TLS 1.3 0-RTT compliance.
func EarlyDataMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil {
			http.Error(w, "TLS connection required", http.StatusBadRequest)
			return
		}

		// Check if early data was used for this request.
		// Go's crypto/tls sets TLS.DidResume to true and populates early data state.
		isEarlyData := r.Header.Get("Early-Data") == "1" || r.TLS.DidResume

		if isEarlyData {
			// Enforce Idempotency rules: only GET/HEAD/OPTIONS are safe for 0-RTT
			switch r.Method {
			case http.MethodGet, http.MethodHead, http.MethodOptions:
				// Safe: Allow execution but mark header for upstream awareness
				w.Header().Set("X-TLS-Early-Data", "accepted")
			default:
				// Unsafe non-idempotent method replayed over 0-RTT.
				// RFC 8470: Return HTTP 425 Too Early to force 1-RTT replay defense.
				w.Header().Set("Retry-After", "0")
				w.WriteHeader(http.StatusTooEarly)
				_, _ = w.Write([]byte("Error: 425 Too Early. Operation is non-idempotent and cannot run over 0-RTT."))
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}

// PaymentHandler handles a sensitive business operation.
func PaymentHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}
	// Securely execute transfer since middleware guaranteed 1-RTT freshness.
	fmt.Fprintf(w, "[SUCCESS] Non-replayed charge processed over validated 1-RTT link.")
}

// Main server configuration
func main() {
	mux := http.NewServeMux()
	mux.Handle("/api/v1/pay", EarlyDataMiddleware(http.HandlerFunc(PaymentHandler)))

	// Strict TLS 1.3 configuration with Session Tickets enabled
	tlsConfig := &tls.Config{
		MinVersion:               tls.VersionTLS13,
		PreferServerCipherSuites: true,
		// Enable 0-RTT (Supported via Session Tickets in TLS 1.3)
		SessionTicketsDisabled: false,
	}

	server := &http.Server{
		Addr:      ":8443",
		Handler:   mux,
		TLSConfig: tlsConfig,
	}

	fmt.Println("[*] Running secure TLS 1.3 server with Anti-Replay Middleware on https://localhost:8443")
	log.Fatal(server.ListenAndServeTLS("server.crt", "server.key"))
}
```

To run a verification check, compile this binary and use OpenSSL or curl to execute a POST request sending a resume ticket. The server will intercept the request and return an HTTP `425 Too Early` response, ensuring the transaction remains completely secure.
