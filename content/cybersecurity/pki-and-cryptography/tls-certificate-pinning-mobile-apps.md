---
title: "TLS Certificate Pinning: Defeating Rogue CAs in Mobile Apps"
description: "How SPKI-based certificate pinning protects mobile apps from rogue CAs and MitM attacks, with Android Network Security Config and iOS ATS pinning examples, and how to avoid bricking the app."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "certificate-pinning"
  - "spki"
  - "mobile-security"
  - "man-in-the-middle"
  - "android"
  - "ios"
---

# TLS Certificate Pinning: Defeating Rogue CAs in Mobile Apps

Standard TLS validation relies on a chain of trust: when a mobile app connects to an API, the server presents a certificate, and the operating system checks whether it was signed by any Certificate Authority residing in its pre-installed root trust store — typically well over a hundred CAs on a modern device.

That broad trust model is exactly the weakness an attacker exploits. If a single CA among those hundreds is compromised, the attacker can mint a mathematically valid, OS-trusted certificate for *any* domain. Users can also be coerced into installing a custom root CA — via a malicious configuration profile, a corporate MDM policy, or a state actor — after which an attacker can transparently intercept, decrypt, modify, and re-encrypt traffic in a Man-in-the-Middle attack. The app, relying purely on the OS's judgment, has no way to know this happened.

## The Solution: Certificate Pinning

Certificate pinning bypasses the OS's broad trust store for a specific set of hosts. Instead of asking "is this certificate signed by *any* trusted CA?", the app hardcodes a stricter question: "is this the exact certificate — or exact public key — I already know belongs to my server?"

By explicitly pinning the expected X.509 certificate or its Subject Public Key Info (SPKI), the app remains secure even if the device itself has been compromised with a rogue root CA: the intercepted certificate simply won't match the hardcoded pin, and the connection is dropped before any data is sent.

### Why Pin the SPKI, Not the Leaf Certificate

You *can* pin a leaf certificate directly, but that forces an app store update every time the certificate is renewed — which happens at least yearly with modern short-lived certificate lifetimes. Pinning the Root or Intermediate CA is more resilient, but the most durable approach is pinning the **SPKI hash** (the hash of the public key itself, independent of the surrounding certificate). When a certificate is renewed using a CSR generated from the *same* private key, the public key — and therefore the pin — stays identical across the renewal.

```text
[MitM Attack WITHOUT Pinning]
App -> OS: "Is this cert valid?"
OS -> Checks Rogue CA -> "Yes!"
App -> Connects to Attacker (compromised)

[MitM Attack WITH Pinning]
App -> OS: "Is this cert valid?"
OS -> Checks Rogue CA -> "Yes!"
App -> Checks internal Pin: "Hash doesn't match expected public key!"
App -> Drops connection (secure)
```

## Extracting the SPKI Hash

```bash
openssl s_client -servername api.example.com -connect api.example.com:443 < /dev/null 2>/dev/null \
    | openssl x509 -pubkey -noout \
    | openssl pkey -pubin -outform der \
    | openssl dgst -sha256 -binary \
    | openssl enc -base64
```

This produces a base64-encoded SHA-256 hash of the public key — the pin value both platforms below expect.

## Android: Network Security Configuration

Since Android 7.0 (API 24), pinning is declarative XML rather than requiring a custom `TrustManager` or an OkHttp interceptor.

`res/xml/network_security_config.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <domain-config>
        <domain includeSubdomains="true">api.example.com</domain>
        <pin-set expiration="2027-12-31">
            <!-- Primary pin: current intermediate CA public key -->
            <pin digest="SHA-256">base64+hash+value=</pin>
            <!-- Backup pin: offline key, kept in cold storage -->
            <pin digest="SHA-256">backup+base64+hash+value=</pin>
        </pin-set>
    </domain-config>
</network-security-config>
```

Reference this from `AndroidManifest.xml`:

```xml
<application android:networkSecurityConfig="@xml/network_security_config">
```

## iOS: App Transport Security (ATS)

Since iOS 14, pinning is configured declaratively in `Info.plist` via `NSPinnedDomains`, without linking a third-party library:

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

The catastrophic failure mode of certificate pinning is **bricking** the app: if the server's private key is compromised (forcing an emergency rotation) or the hosting provider migrates infrastructure and issues a new certificate with a new key, the app's hardcoded SPKI no longer matches anything the server presents. An app with only the old pin refuses to connect to the new — legitimate — server, and the only fix is an emergency binary release that users must manually install.

**Practices to avoid bricking:**

1. **Always ship a backup pin.** Generate a second keypair offline, hash its public key, and embed that hash in the app alongside the primary pin. Keep the private key in cold storage; if the primary infrastructure is ever compromised or lost, you can stand up a new server using this backup key and the app keeps working without an update.
2. **Pin the intermediate CA, not the leaf**, when your CA relationship is stable — this survives ordinary leaf certificate rotations automatically, since the intermediate signing key doesn't change on renewal.
3. **Set an expiration on the pin set.** Android's `<pin-set expiration="...">` disables pinning after the given date, gracefully degrading to normal OS trust rather than bricking the app if the pins are never updated before the deadline.

## Key Takeaways

- Certificate pinning defends against a compromised or coerced CA, a threat the standard OS trust store cannot detect on its own.
- Pin the SPKI hash (public key), not the full certificate — it survives certificate renewal as long as the same private key is reused.
- Always ship a backup pin generated from an offline keypair; a single pin with no fallback turns key rotation into an outage.
- An expiration date on the pin set is a safety valve: it converts "silently broken forever" into "gracefully falls back to OS trust."
