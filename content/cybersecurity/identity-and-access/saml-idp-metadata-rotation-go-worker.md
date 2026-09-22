---
title: "SAML Trust Management: A Go Background Worker for IdP Certificate Rotation"
description: "How to build a background worker in Go that fetches SAML IdP metadata on a schedule, safely rotates trusted signing certificates, and fails safe when the IdP endpoint is unreachable."
categorySlug: "identity-access"
articleType: "GUIDE"
tags:
  - "saml"
  - "idp-metadata"
  - "certificate-rotation"
  - "go"
  - "background-worker"
  - "sso"
---

# SAML Trust Management: A Go Background Worker for IdP Certificate Rotation

## The Problem: The Ticking Time Bomb of Hardcoded Certificates

SAML 2.0 relies on asymmetric cryptography (usually RSA) to establish trust: the Identity Provider (IdP) signs SAML assertions with its private key, and the Service Provider (SP) verifies them using the IdP's public key certificate.

A pervasive, critical anti-pattern in enterprise SaaS is **hardcoding the IdP's X.509 certificate** directly into the SP's configuration files or database. Certificates expire. When an IdP rotates its signing certificate and the SP is still relying on the old hardcoded one, every login is rejected instantly — a total application outage. Administrators are then forced into manual "certificate rotation ceremonies," exchanging PEM files over email and updating configs at exact times to minimize downtime — brittle, insecure, and error-prone.

## The Solution: Automated Metadata Consumption

SAML 2.0 defines a standardized mechanism for this: **SAML Metadata XML**. The IdP hosts a well-known HTTPS endpoint (e.g. `https://idp.example.com/metadata.xml`) publishing its EntityID, SSO endpoints, and currently valid X.509 signing certificates.

To eliminate outages, the SP runs a background worker that periodically fetches this metadata, parses the `<KeyDescriptor>` elements, and dynamically updates its trusted certificate store. When the IdP rotates keys, it publishes *both* the old and new certificates during the transition — the SP consuming both allows seamless validation while the rollover is in progress.

## Architectural Flow

```text
  [Identity Provider]                            [Service Provider]
          |                                              |
    (Hosts metadata.xml)                                 |
          | <=========================================== | (Cron Job: Every 12 Hours)
          |   HTTP GET /metadata.xml                     |
          |                                              |
          | ===========================================> | (Returns XML)
          |   <EntityDescriptor>                         |
          |     <KeyDescriptor use="signing">            | -> SP Parses XML
          |       <X509Certificate>MIIC...</...>         | -> SP Caches Certs in DB/Redis
          |                                              |
                                                         |
          | <=========================================== | (User Login Attempt)
          |   SAML POST (Signed with Private Key)        |
          | ===========================================> |
                                                         | -> SP validates signature against
                                                              dynamically cached Certs.
```

## Implementation: Metadata Fetcher (Go)

This background worker fetches IdP metadata, parses the certificates, and hot-swaps the local trust anchor, preventing expiration-based outages.

```go
package main

import (
	"encoding/xml"
	"fmt"
	"io"
	"log"
	"net/http"
	"sync"
	"time"
)

// Simplified SAML Metadata Structs
type EntityDescriptor struct {
	XMLName        xml.Name       `xml:"EntityDescriptor"`
	EntityID       string         `xml:"entityID,attr"`
	IDPSSODescriptor IDPSSODescriptor `xml:"IDPSSODescriptor"`
}

type IDPSSODescriptor struct {
	KeyDescriptors []KeyDescriptor `xml:"KeyDescriptor"`
}

type KeyDescriptor struct {
	Use  string `xml:"use,attr"`
	Cert string `xml:"KeyInfo>X509Data>X509Certificate"`
}

var (
	// Thread-safe cache for the active IdP certificates
	trustedCerts      []string
	trustedCertsMutex sync.RWMutex
	MetadataURL       = "https://idp.serenya.com/saml/metadata"
)

// Background worker that runs periodically to fetch fresh certificates
func StartMetadataRefresher(interval time.Duration) {
	ticker := time.NewTicker(interval)
	go func() {
		// Run once immediately on startup
		if err := fetchAndParseMetadata(); err != nil {
			log.Printf("[CRITICAL] Failed initial metadata fetch: %v", err)
		}

		for range ticker.C {
			if err := fetchAndParseMetadata(); err != nil {
				log.Printf("[ERROR] Metadata refresh failed: %v. Retaining old keys.", err)
			}
		}
	}()
}

func fetchAndParseMetadata() error {
	// 1. Fetch the XML over TLS (Ensures transport integrity)
	resp, err := http.Get(MetadataURL)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		return fmt.Errorf("unexpected status code: %d", resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return err
	}

	// 2. Parse the XML
	var metadata EntityDescriptor
	if err := xml.Unmarshal(body, &metadata); err != nil {
		return err
	}

	var newCerts []string

	// 3. Extract all valid signing certificates
	for _, kd := range metadata.IDPSSODescriptor.KeyDescriptors {
		if kd.Use == "signing" || kd.Use == "" { // Empty implies both signing and encryption
			newCerts = append(newCerts, kd.Cert)
		}
	}

	if len(newCerts) == 0 {
		return fmt.Errorf("metadata contained no signing certificates")
	}

	// 4. Safely update the global trust store
	trustedCertsMutex.Lock()
	trustedCerts = newCerts
	trustedCertsMutex.Unlock()

	log.Printf("[INFO] Successfully rotated IdP certificates. Active certs: %d", len(trustedCerts))
	return nil
}

// ... use trustedCerts in your SAML validation logic ...
```

## Engineering Considerations

1. **Metadata Signature Validation**: the metadata file itself is often signed by the IdP. For high-security environments, do not rely on the TLS connection alone — verify the XML signature of `metadata.xml` against a root CA or a permanently pinned trust anchor before parsing keys out of it.
2. **Graceful Failures**: if the metadata endpoint goes down, the worker *must not* clear the local cache. Log an alert and keep using the last known good certificates until the endpoint recovers.
3. **IdP Key Rollover Support**: ensure your SAML validation logic iterates through *all* cached certificates when validating an incoming assertion. An IdP signs with its new key while still publishing both old and new keys in metadata during the transition — a validator that only checks the first cached certificate will start rejecting logins the moment the IdP switches signing keys, even though the transition was announced in advance.
