# TLS Certificate Pinning: Defeating Rogue CAs and MitM Attacks in Mobile Apps

## The Problem: The Fragility of the Public PKI Trust Store

Standard TLS validation relies on a chain of trust. When a mobile application connects to an API, the server presents a certificate. The operating system (iOS or Android) checks if this certificate was signed by any Certificate Authority (CA) residing in its pre-installed Root Trust Store. 

If an attacker compromises a single CA among the hundreds trusted by the OS, they can generate a mathematically valid, trusted certificate for *any* domain. Furthermore, users can be coerced into installing custom Root CAs (e.g., by a malicious profile, a corporate IT department, or a state actor). Once a rogue CA is installed, attackers can seamlessly intercept, decrypt, modify, and re-encrypt traffic via a Man-in-the-Middle (MitM) attack. The application, relying purely on the OS, remains completely unaware.

## The Solution: Certificate Pinning

Certificate Pinning bypasses the OS's broad trust store. Instead of asking "Is this certificate signed by *any* trusted CA?", the application hardcodes the answer: "Is this certificate signed by *my specific* CA?" or "Is this the exact public key I expect?"

By explicitly defining the expected X.509 certificate or its Subject Public Key Info (SPKI), pinning ensures that even if a mobile device is compromised with a rogue Root CA, the application will drop the connection because the intercepted certificate does not match the hardcoded pin.

### Architecture: Pinning the SPKI

While you can pin a leaf certificate, it forces an app update every time the certificate expires. Pinning the Root or Intermediate CA certificate is better, but the most resilient approach is pinning the **Public Key (SPKI hash)**. 

When a certificate expires, you can generate a new certificate signing request (CSR) using the exact same private key. Because the public key remains identical, the app's pin remains valid across renewals.

```text
    [MitM Attack WITHOUT Pinning]
    App -> OS: "Is this cert valid?"
    OS -> Checks Rogue CA -> "Yes!"
    App -> Connects to Attacker (Compromise!)

    [MitM Attack WITH Pinning]
    App -> OS: "Is this cert valid?"
    OS -> Checks Rogue CA -> "Yes!"
    App -> Checks internal Pin: "Hash doesn't match expected Public Key!"
    App -> Drops connection. (Secure)
```

## Implementation: Pinning in Mobile Operating Systems

Historically, pinning required complex integrations with libraries like OkHttp (Android) or TrustKit (iOS). Today, both major platforms support declarative pinning directly in their network configuration files.

### 1. Extracting the SPKI Hash

First, extract the SHA-256 hash of the public key (the pin) from your server's certificate.

```bash
# Extract the SPKI SHA-256 hash in Base64 format
openssl s_client -servername api.example.com -connect api.example.com:443 < /dev/null 2>/dev/null \
    | openssl x509 -pubkey -noout \
    | openssl pkey -pubin -outform der \
    | openssl dgst -sha256 -binary \
    | openssl enc -base64
```
Output example: `base64+hash+value=`

### 2. Android: Network Security Configuration

Since Android 7.0 (API 24), pinning is configured declaratively in XML. 

**`res/xml/network_security_config.xml`**:
```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config>
        <!-- Scope the pin to specific domains -->
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2025-12-31">
            <!-- Primary Pin (e.g., Intermediate CA public key) -->
            <pin digest="SHA-256">base64+hash+value=</pin>
            <!-- Backup Pin (CRITICAL: Offline backup key to prevent bricking) -->
            <pin digest="SHA-256">backup+base64+hash+value=</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

Link this file in the `AndroidManifest.xml` via `android:networkSecurityConfig="@xml/network_security_config"`.

### 3. iOS: App Transport Security (ATS)

Since iOS 14, Apple supports pinning via the `Info.plist` utilizing `NSPinnedDomains`.

**`Info.plist`**:
```xml
<key>NSAppTransportSecurity</key>
<dict>
    <key>NSPinnedDomains</key>
    <dict>
        <key>api.example.com</key>
        <dict>
            <key>NSIncludesSubdomains</key>
            <true/>
            <key>NSPinnedLeafIdentities</key>
            <array>
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>base64+hash+value=</string>
                </dict>
                <!-- Backup Pin -->
                <dict>
                    <key>SPKI-SHA256-BASE64</key>
                    <string>backup+base64+hash+value=</string>
                </dict>
            </array>
        </dict>
    </dict>
</dict>
```

## The Danger of Bricking

The catastrophic risk of certificate pinning is "bricking" the app. If a server's private key is compromised, or the hosting provider forces a certificate rotation (e.g., moving to a new cloud load balancer that provisions its own keys), the SPKI changes. 

If the app only contains the old pin, it will refuse to connect to the new legitimate server. The only remedy is an emergency app update, which users must manually download.

**Best Practices to Avoid Bricking:**
1. **Always implement a Backup Pin**: Generate an offline keypair, hash the public key, and embed it in the app. Keep the private key in cold storage. If your primary infrastructure burns down, you can spin up a new server using this backup key.
2. **Pin the Root/Intermediate, not the Leaf**: Pinning the CA's public key provides resilience against leaf certificate rotations, provided you stay with the same CA.
3. **Use Expiration Dates**: The Android configuration allows `<pin-set expiration="...">`. Once this date passes, pinning is disabled, gracefully degrading to OS trust rather than bricking the app if you forget to update the pins.
