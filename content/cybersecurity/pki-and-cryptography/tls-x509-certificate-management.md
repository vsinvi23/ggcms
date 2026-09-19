---
title: "Public Key Infrastructure (PKI) & TLS X.509 Certificate Management"
description: "A comprehensive guide to asymmetric cryptography, TLS 1.3 handshakes, X.509 certificate chains, automated ACME renewals, and Go mTLS implementation."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "tls"
  - "x509-certificates"
  - "public-key-infrastructure"
---

# Public Key Infrastructure (PKI) & TLS X.509 Certificate Management

Public Key Infrastructure (PKI) underpins secure communications across the web. Through asymmetric cryptography, digital certificates, and Certificate Authorities (CAs), PKI provides **Confidentiality** (encryption), **Integrity** (tamper prevention), and **Authentication** (identity verification).

This guide covers TLS 1.3 handshake mechanics, X.509 certificate chain validation, OpenSSL key management, ACME auto-renewal, and mutual TLS (mTLS) in Go.

---

## 1. TLS 1.3 Handshake Sequence

TLS 1.3 reduces handshake latency from 2 round-trips (2-RTT) down to **1-RTT** by combining key exchange and cipher agreement into the initial ClientHello message.

```text
 Client                                                                 Server
   │                                                                      │
   │ ClientHello                                                          │
   │  + Key_Share (ECDHE public key)                                      │
   │  + Supported_Versions (TLS 1.3)                                     │
   │  + CipherSuites                                                      │
   ├─────────────────────────────────────────────────────────────────────►│
   │                                                                      │
   │                                                         ServerHello  │
   │                                     + Key_Share (Server public key)  │
   │                                           {EncryptedExtensions}      │
   │                                                   {Certificate}      │
   │                                             {CertificateVerify}      │
   │                                                      {Finished}      │
   │◄─────────────────────────────────────────────────────────────────────┤
   │                                                                      │
   │ [Application Data Encrypted via AES-GCM / ChaCha20-Poly1305]        │
   │◄────────────────────────────────────────────────────────────────────►│
```

---

## 2. X.509 Certificate Chain Hierarchy

Trust in TLS certificates relies on a hierarchical chain of signatures:

```text
 ┌──────────────────────────────┐
 │ Root Certificate Authority   │ ──► Self-signed, stored in operating system
 │ (e.g. DigiCert / ISRG Root)  │     / browser trusted trust stores.
 └──────────────┬───────────────┘
                │ Signs
                ▼
 ┌──────────────────────────────┐
 │ Intermediate CA              │ ──► Used for day-to-day issuance to protect
 │ (e.g. Let's Encrypt R3)      │     offline Root CA private keys.
 └──────────────┬───────────────┘
                │ Signs
                ▼
 ┌──────────────────────────────┐
 │ Leaf Certificate             │ ──► Deployed on backend web servers / proxies
 │ (api.geekgully.com)          │     Valid for 90 days - 1 year.
 └──────────────────────────────┘
```

---

## 3. OpenSSL CLI Cheatsheet for Certificate Generation

```bash
# 1. Generate RSA 4096-bit Private Key
openssl genrsa -out server.key 4096

# 2. Generate Certificate Signing Request (CSR)
openssl req -new -key server.key -out server.csr \
  -subj "/CN=api.geekgully.local/O=GeekGully/C=US"

# 3. Generate Self-Signed X.509 Certificate (valid 365 days)
openssl x509 -req -days 365 -in server.csr -signkey server.key -out server.crt

# 4. Inspect X.509 Certificate Metadata & Expiration Date
openssl x509 -in server.crt -text -noout
```

---

## 4. Production Go Mutual TLS (mTLS) Server Setup

In zero-trust microservice environments, servers require clients to present valid certificates (**mTLS**).

```go
package main

import (
	"crypto/tls"
	"crypto/x509"
	"log"
	"net/http"
	"os"
)

func main() {
	// Load CA certificate used to verify incoming client certificates
	caCert, err := os.ReadFile("ca.crt")
	if err != nil {
		log.Fatalf("Failed to read CA cert: %v", err)
	}

	caCertPool := x509.NewCertPool()
	caCertPool.AppendCertsFromPEM(caCert)

	tlsConfig := &tls.Config{
		ClientCerts: caCertPool,
		// Enforce strict mutual TLS authentication
		ClientAuth: tls.RequireAndVerifyClientCert,
		MinVersion: tls.VersionTLS13,
	}

	server := &http.Server{
		Addr:      ":8443",
		TLSConfig: tlsConfig,
	}

	http.HandleFunc("/api/secure", func(w http.ResponseWriter, r *http.Request) {
		clientCert := r.TLS.PeerCertificates[0]
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("Authenticated mTLS Client: " + clientCert.Subject.CommonName))
	})

	log.Println("Starting mTLS Server on :8443...")
	log.Fatal(server.ListenAndServeTLS("server.crt", "server.key"))
}
```

---

## 5. Key Takeaways

1. **Use TLS 1.3 Exclusively**: Disable legacy TLS 1.0/1.1 protocols and weak RSA cipher suites.
2. **Automate Certificate Renewal via ACME**: Use Certbot or cert-manager in Kubernetes to automate 90-day certificate rotations before expiration.
3. **Enforce mTLS for Internal Microservices**: Protect service-to-service communication by requiring client certificate validation.
