# Mutual TLS (mTLS): Certificate-based Client Authentication and SAN Validation

## The Problem: The "CA-Wide Authorization Bypass" Vulnerability

Mutual TLS (mTLS) is a cornerstone of zero-trust architecture, establishing cryptographically verified, bidirectional identities between a client and a server. During the handshake, the server requests the client's certificate (`CertificateRequest`), validates the cryptographic signature of the certificate chain against a trusted Root Certificate Authority (CA), and establishes the connection.

However, a critical security vulnerability exists in many naive mTLS configurations. Developers often configure their servers to check only that a client certificate is *valid* and *signed* by the trusted CA. This creates the **CA-Wide Authorization Bypass**:
*   Any client presenting a certificate signed by the shared CA—such as an external vendor, a low-privilege internal microservice, or a development node—will be successfully authenticated.
*   Once inside, the client has lateral access to high-privileged APIs because the server does not perform secondary validation on the certificate's identity parameters.

To prevent unauthorized lateral movement, the server must dynamically inspect and authorize identity attributes inside the client certificate, specifically **Subject Alternative Names (SANs)** (such as SPIFFE IDs or DNS/URI mappings), after cryptographic validation.

---

## The mTLS Handshake & SAN Validation Pipeline

In mTLS, verification occurs in a two-stage process:
1.  **Transport Validation:** Cryptographic verification of the certificate chain, expiration times, signatures, and proof-of-possession of the private key.
2.  **Identity Authorization:** Extraction of the Subject Alternative Names (SANs) from the validated certificate, checking them against an explicit Access Control List (ACL).

```
   Client                                                                 Server
     |                                                                      |
     +-------------------------- ClientHello ------------------------------>|
     |<-------------- ServerHello, Certificate, CertificateRequest ----------+
     |                                                                      |
     +----------- ClientCertificate, ClientKeyExchange, CertVerify -------->|
     |                                                                      |
     |                                                              [1. Crypto Validation]
     |                                                              - Verify signature chain
     |                                                              - Verify key possession
     |                                                                      |
     |                                                              [2. Identity Auth]
     |                                                              - Call VerifyConnection()
     |                                                              - Extract SAN (SPIFFE/URI)
     |                                                              - Check against ACL
     |                                                                      |
     |<--------------------------- Finished <====================== (Allow / Reject Conn)
```

---

## Code Implementation: Secure mTLS Server with Custom SAN Verification in Go

The following Go implementation builds a secure mTLS server. It utilizes a custom `VerifyConnection` callback within the `tls.Config` struct. This callback is executed after standard handshake verification, enabling strict validation of the client's URI-based SPIFFE ID.

```go
package main

import (
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
)

// AuthorizedIdentities defines our strict mTLS ACL
var AuthorizedIdentities = map[string]bool{
	"spiffe://serenya.internal/ns/prod/sa/payment-engine": true,
	"spiffe://serenya.internal/ns/prod/sa/reporting-api":  true,
}

// CustomVerifyConnection intercepts the TLS handshake post-verification
func CustomVerifyConnection(cs tls.ConnectionState) error {
	// Ensure at least one verified certificate chain exists
	if len(cs.VerifiedChains) == 0 || len(cs.VerifiedChains[0]) == 0 {
		return errors.New("mtls: no verified client certificate chain found")
	}

	// The leaf certificate is the first element in the verified chain
	leaf := cs.VerifiedChains[0][0]

	// Extract and validate SPIFFE ID from URI SANs
	var spiffeID string
	for _, uri := range leaf.URIs {
		if strings.HasPrefix(uri.String(), "spiffe://") {
			spiffeID = uri.String()
			break
		}
	}

	if spiffeID == "" {
		return errors.New("mtls: client certificate is missing a valid SPIFFE ID in the URI SAN field")
	}

	// Query our Access Control List (ACL)
	if !AuthorizedIdentities[spiffeID] {
		log.Printf("Security Alert: Connection rejected for unauthorized identity: %s", spiffeID)
		return fmt.Errorf("mtls: identity %s is not authorized to access this service", spiffeID)
	}

	log.Printf("Security: Mutually authenticated connection established for: %s", spiffeID)
	return nil
}

func main() {
	caCertPoolPath := os.Getenv("MTLS_CA_CERT")
	serverCertPath := os.Getenv("SERVER_CERT")
	serverKeyPath := os.Getenv("SERVER_KEY")

	if caCertPoolPath == "" || serverCertPath == "" || serverKeyPath == "" {
		log.Fatal("Paths MTLS_CA_CERT, SERVER_CERT, and SERVER_KEY must be set.")
	}

	// 1. Load CA cert to verify client certificates
	caCert, err := os.ReadFile(caCertPoolPath)
	if err != nil {
		log.Fatalf("Failed to read CA Cert: %v", err)
	}
	caCertPool := x509.NewCertPool()
	if !caCertPool.AppendCertsFromPEM(caCert) {
		log.Fatal("Failed to append CA Certificate to pool")
	}

	// 2. Load Server Certificate and Private Key
	serverCert, err := tls.LoadX509KeyPair(serverCertPath, serverKeyPath)
	if err != nil {
		log.Fatalf("Failed to load server keypair: %v", err)
	}

	// 3. Configure strict mTLS TLS settings
	tlsConfig := &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientCAs:    caCertPool,
		// Require client to present a cert, and run standard validation against ClientCAs
		ClientAuth:   tls.RequireAndVerifyClientCert,
		// Enforce TLS 1.3 as the absolute minimum version
		MinVersion:   tls.VersionTLS13,
		// Perform runtime SAN and ACL validation after physical TLS validation is complete
		VerifyConnection: CustomVerifyConnection,
	}

	server := &http.Server{
		Addr:      ":8443",
		TLSConfig: tlsConfig,
	}

	http.HandleFunc("/api/transact", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"processed"}`))
	})

	log.Println("Secure mTLS Server listening on port 8443...")
	if err := server.ListenAndServeTLS("", ""); err != nil && err != http.ErrServerClosed {
		log.Fatalf("Server startup failed: %v", err)
	}
}
```

---

## Defensive Engineering Best Practices

1.  **Do Not Parse Subject Common Names (CN) for Authentication:** RFC 6125 deprecates using the certificate's CN field for identity validation. DNS, IP, and SPIFFE URI identities must always be checked within the SAN extension.
2.  **Enforce TLS 1.3:** TLS 1.3 encrypts the client certificate exchange during the handshake, preventing passive network observers from sniffing client certificates and mapping out your internal network layout/topology.
3.  **Use Short-Lived Certificates:** Minimize exposure to key compromise by issuing certificates with short validity windows (e.g., 24 hours). Use an automated manager (like cert-manager, HashiCorp Vault, or SPIRE) to handle automated renewal and rotation.
4.  **Pin Cipher Suites:** Limit cryptographic exposure by only supporting highly resilient cipher suites that provide forward secrecy:
    *   `TLS_AES_256_GCM_SHA384`
    *   `TLS_CHACHA20_POLY1305_SHA256`
