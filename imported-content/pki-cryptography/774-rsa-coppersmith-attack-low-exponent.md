# RSA Vulnerabilities: Coppersmith's Attack on Low Public Exponents (e=3)

## The Problem: The Desire for Speed in RSA

RSA encryption and signature verification rely on modular exponentiation. The public key consists of the modulus $N$ and the public exponent $e$. The encryption of a message $M$ is defined as $C \equiv M^e \pmod N$.

To maximize performance—especially on low-power devices verifying signatures or establishing TLS handshakes—developers often choose a very small public exponent. The smallest possible valid exponent is $e = 3$. Because $3$ has a low Hamming weight (it's small in binary), the computational cost of $M^3 \pmod N$ is vastly lower than using the standard $e = 65537$ ($2^{16} + 1$).

However, small exponents introduce catastrophic mathematical vulnerabilities when combined with unpadded messages or predictable message structures. Don Coppersmith proved that if you know a significant portion of a message encrypted with RSA, you can use lattice basis reduction (via the LLL algorithm) to find the remaining unknown parts of the message in polynomial time, completely breaking the encryption.

## Technical Architecture: The Unpadded Cube Root Flaw

Before delving into Coppersmith's theorem, we must understand the fundamental flaw of unpadded RSA with $e=3$. 

Assume an attacker intercepts a ciphertext $C$. 
The modulus $N$ is typically 2048 bits. 
If the plaintext message $M$ is short (e.g., a 256-bit AES key), then $M^3$ will be at most 768 bits.

Because 768 bits is strictly less than the 2048-bit modulus $N$, the modulo operation has absolutely no effect. The equation degrades from modular arithmetic to standard arithmetic over integers:
$C \equiv M^3 \pmod N \implies C = M^3$

To recover the plaintext, the attacker does not need to factor $N$. They simply take the standard integer cube root of $C$.

```text
    [Vulnerable RSA e=3 Flow]
    Modulus N (2048 bit)
    Message M (256 bit)  -> "SecretKey123"

    Encryption:
    M^3 = 768 bit integer.
    768 bits < 2048 bits, so modulo N does nothing.
    C = M^3

    Attacker:
    Intercepts C.
    Calculates ∛C over integers.
    Recovers M instantly.
```

### Code Implementation: The Integer Cube Root

In Python, taking an integer cube root breaks unpadded RSA instantly.

```python
import gmpy2
from Crypto.Util.number import bytes_to_long, long_to_bytes

# Vulnerable Setup
message = b"ShortSecretKey"
M = bytes_to_long(message)
e = 3
N = 0x9b3a... # Large 2048-bit modulus

# Encryption
C = pow(M, e, N) 

# Attack: Because M^3 < N, the modulo is irrelevant.
# We just take the precise integer cube root.
root, is_exact = gmpy2.iroot(C, 3)

if is_exact:
    recovered_message = long_to_bytes(root)
    print(f"[+] Message recovered: {recovered_message}")
```

## Enter Coppersmith: Stereotyped Messages

Proper PKCS#1 v1.5 or OAEP padding destroys the simple cube root attack by expanding the message size so that $M^3 > N$, forcing the modulo operation to wrap around.

However, Coppersmith's theorem states that if we are looking for a small root $x_0$ to a polynomial $f(x)$ modulo $N$, we can find it efficiently if $|x_0| < N^{1/e}$.

This enables the **Stereotyped Message Attack**. Suppose the padded message has a known structure (a "stereotype"), but contains a small unknown secret $x$.

For example, a banking transaction might format the plaintext as:
`M = "From: Alice\nTo: Bob\nAmount: " || x || "\nDate: 2026..."`

The attacker knows the entire string except for $x$. 
Let $B$ be the known prefix and suffix transformed into an integer, such that $M = B + x$.
The encryption equation is $C \equiv (B + x)^3 \pmod N$.

We construct the polynomial:
$f(x) = (B + x)^3 - C \equiv 0 \pmod N$

The attacker wants to find the root $x$. If the unknown portion $x$ is smaller than $N^{1/3}$ (which is roughly 682 bits for a 2048-bit modulus), Coppersmith's algorithm constructs a lattice and uses the Lenstra-Lenstra-Lovász (LLL) algorithm to find the root $x$ in polynomial time, recovering the secret without factoring $N$.

### SageMath Implementation of Coppersmith (Conceptual)

In SageMath, which has LLL built-in, breaking a stereotyped message is a one-liner.

```python
# SageMath script
N = ... # 2048-bit modulus
e = 3
C = ... # Intercepted ciphertext
# Known prefix mapped to high bits
B = bytes_to_long(b"Transaction ID: ") * (2**unknown_bits)

# Define polynomial ring modulo N
P.<x> = PolynomialRing(Zmod(N))

# The polynomial f(x) = (B + x)^3 - C
f = (B + x)^3 - C

# Find small roots using Coppersmith's method
roots = f.small_roots(X=2**unknown_bits, beta=1)

if roots:
    print(f"Recovered secret: {roots[0]}")
```

## Summary and Remediation

While $e=3$ is mathematically sound *if* combined with perfect padding (like RSA-OAEP), historical implementation flaws have repeatedly exposed data to Coppersmith's attacks. 

Because padding schemes are notoriously difficult to implement without side-channel leaks, the cryptographic community standardized on using $e = 65537$ ($0x10001$). This exponent is large enough to naturally thwart cube root and small-root Coppersmith attacks, while still maintaining only two `1` bits in its binary representation, keeping exponentiation extremely fast.
