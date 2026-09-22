# TLS Certificate Pinning: Defeating Rogue CAs and MitM Attacks in Mobile Apps

## The Problem: The Fragility of the Public CA Trust Model

By default, operating systems (iOS, Android, Windows) trust hundreds of root Certificate Authorities (CAs). If any single one of these root CAs is compromised, or if a user is tricked into installing a custom root certificate (e.g., in enterprise environments or via spyware), a Man-in-the-Middle (MitM) attacker can issue a fraudulent certificate for your domain.

When a mobile app connects to `https://api.yoursecurebank.com`, the OS validates the certificate chain up to its local trust store. If the attacker has intercepted the traffic and presented a certificate issued by a trusted (but rogue) CA, the TLS handshake succeeds. The attacker can now decrypt and modify all sensitive API traffic in real-time.

```text
Traditional TLS Validation:
[Mobile App] ---> [Attacker Proxy (Rogue CA Cert)] ---> [Server]
    ^
    |-- Checks OS Trust Store (Trusts Rogue CA) -> Success (MITM Vulnerable)

With TLS Certificate Pinning:
[Mobile App] ---> [Attacker Proxy (Rogue CA Cert)]
    ^
    |-- Checks Pin (Expected hash: 0x9f3d...) vs presented public key -> Abort (MITM Prevented)
```

The challenge is to bypass the local trust store entirely and bind the application to a highly specific cryptographic parameter—specifically, the public key of your API server.

---

## Public Key Pinning (SPKI)

Pinning the entire certificate is brittle; when the certificate expires and is renewed, the application must be updated immediately to prevent global service outages. 

The industry standard is **Subject Public Key Info (SPKI) Pinning**. By pinning the SHA-256 hash of the public key's subject info, the certificate can be renewed indefinitely (using the same key pair) without breaking the mobile app's validation checks.

---

## Implementation: Pinning in Kotlin and Swift

### 1. Kotlin (Android) with OkHttpClient SPKI Pinning

```kotlin
import okhttp3.CertificatePinner
import okhttp3.OkHttpClient
import okhttp3.Request

fun getSecureClient(): OkHttpClient {
    // Define the public key pins (Primary and Backup pins are mandatory)
    val certificatePinner = CertificatePinner.Builder()
        .add("api.yoursecurebank.com", "sha256/g89mX9b9Vv12...=") // Primary SPKI Hash
        .add("api.yoursecurebank.com", "sha256/H8s9X8b8Cc44...=") // Backup SPKI Hash
        .build()

    return OkHttpClient.Builder()
        .certificatePinner(certificatePinner)
        .build()
}
```

### 2. Swift (iOS) with URLSession SPKI Verification

```swift
import Foundation
import CommonCrypto

class PinningDelegate: NSObject, URLSessionDelegate {
    let pinnedPublicKeyHash = "g89mX9b9Vv12...=" // Expected Base64 SHA256 SPKI

    func urlSession(_ session: URLSession, didReceive challenge: URLAuthenticationChallenge, completionHandler: @escaping (URLSession.AuthChallengeDisposition, URLCredential?) -> Void) {
        guard challenge.protectionSpace.authenticationMethod == NSURLAuthenticationMethodServerTrust,
              let serverTrust = challenge.protectionSpace.serverTrust else {
            completionHandler(.cancelAuthenticationChallenge, nil)
            return
        }

        // 1. Get public key from server certificate
        if let certificate = SecTrustGetCertificateAtIndex(serverTrust, 0) {
            let publicKey = SecCertificateCopyKey(certificate)
            if let publicKeyData = SecKeyCopyExternalRepresentation(publicKey!, nil) as Data? {
                // 2. Compute SHA-256 hash of public key
                var hash = [UInt8](repeating: 0,  count: Int(CC_SHA256_DIGEST_LENGTH))
                publicKeyData.withUnsafeBytes {
                    _ = CC_SHA256($0.baseAddress, CC_LONG(publicKeyData.count), &hash)
                }
                let base64Hash = Data(hash).base64EncodedString()

                // 3. Verify Match
                if base64Hash == pinnedPublicKeyHash {
                    completionHandler(.useCredential, URLCredential(trust: serverTrust))
                    return
                }
            }
        }
        completionHandler(.cancelAuthenticationChallenge, nil) // Pin mismatch
    }
}
```

---

## Bypassing Pinning: The Frida Attack Vector

Security researchers and attackers use dynamic instrumentation engines like **Frida** to hook the application's runtime and force the certificate pinning methods to always return `true`. Below is a standard Frida script designed to bypass common OkHttpClient certificate pin checks:

```javascript
Java.perform(function () {
    var CertificatePinner = Java.use("okhttp3.CertificatePinner");
    
    // Override the check method to disable pinning validation
    CertificatePinner.check.overload('java.lang.String', 'java.util.List').implementation = function (hostname, peerCertificates) {
        console.log("[Frida] Pinning bypassed for host: " + hostname);
        return; // Return void, bypassing safety check
    };
});
```

---

## Hardening App Integrity Against Frida Bypasses

To defend your pinning logic against Frida hook-level bypasses:

1. **Anti-Debugging and Jailbreak Detection**:
   Monitor system directories for jailbreak artifacts (e.g., `/Applications/Cydia.app`, Substrate) and monitor debug states using system APIs like `sysctl` in iOS or `/proc/self/status` in Android to terminate the app if a debugger or Frida server is attached.
2. **Native Verification (C/C++)**:
   Move pinning verification out of high-level languages like Swift/Kotlin into a compiled native library (`.so` or compiled C binary). Reverse engineering and hooking native functions in memory is significantly more complex than hooking objective-C or Java runtimes.
3. **Multi-Pinning**:
   Pin at least three targets: the Leaf public key, an Intermediate CA, and a root CA. This ensures fallback pathways are available if your leaf private key is compromised.
