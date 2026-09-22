# RSA Vulnerabilities: Coppersmith's Attack on Low Public Exponents (e=3)

## The Problem: The Performance Trap of Low Exponents

In RSA cryptography, the public key is composed of a modulus $N = pq$ and a public exponent $e$. Standard public exponents include $65537$ ($2^{16} + 1$) and, historically, smaller exponents like $3$ or $17$. Systems with constrained CPU resources (such as IoT devices or smart cards) frequently use $e = 3$ because encryption and signature verification require only two multiplications:

$$\text{Ciphertext} = m^3 \pmod N$$

However, selecting $e = 3$ introduces severe mathematical vulnerabilities. When the message $m$ is small, or when the padding is predictable, the algebraic structure of the encryption equation is preserved. This allows an attacker to bypass the integer factorization problem entirely and decrypt ciphertexts directly using **Coppersmith’s Method** or **Håstad's Broadcast Attack**.

---

## Architectural Vulnerability: Håstad's Broadcast Attack

When the same message $m$ is encrypted and sent to $e$ different recipients (e.g., three separate servers, each with their own public modulus $N_i$ and the same public exponent $e = 3$), an eavesdropper can intercept the three independent ciphertexts:

$$C_1 = m^3 \pmod{N_1}$$
$$C_2 = m^3 \pmod{N_2}$$
$$C_3 = m^3 \pmod{N_3}$$

```
                +-------------------+
                |     Message 'm'   |
                +---------+---------+
                          |
         +----------------+----------------+
         |                                 |
         v (Encrypted with N_1)            v (Encrypted with N_2)
   $C_1 = m^3 \pmod{N_1}$            $C_2 = m^3 \pmod{N_2}$
         |                                 |
         +----------------+----------------+
                          |
                          v (Chinese Remainder Theorem)
                $C_{new} = m^3 \pmod{N_1 N_2 N_3}$
                          |
                          v (Direct Cube Root)
                $m = \sqrt[3]{C_{new}}$ (No modular reduction needed!)
```

Using the **Chinese Remainder Theorem (CRT)**, the attacker reconstructs a new ciphertext $C_{new}$ such that:

$$C_{new} = m^3 \pmod{N_1 N_2 N_3}$$

Since $m < N_i$ for all $i$, we know that $m^3 < N_1 N_2 N_3$. Consequently, $C_{new}$ is exactly equal to $m^3$ over the integers, without any modular reduction. The attacker can compute the ordinary integer cube root of $C_{new}$ to recover the plaintext $m$ instantly, without factoring $N$.

---

## Technical Core: Coppersmith’s Method

Coppersmith's Method uses the **LLL (Lenstra–Lenstra–Lovász)** lattice basis reduction algorithm to find small integer roots of a monic polynomial $f(x)$ of degree $d$ modulo $N$. 

If a polynomial has a root $x_0$ modulo $N$ such that:

|x_0| < N^{\frac{1}{d} - \epsilon}

then $x_0$ can be found in polynomial time. For $e = 3$, if an attacker knows a significant portion of the message (e.g., standard protocol headers) but is missing a small chunk (such as a 128-bit session key), they can write the encryption as a polynomial $f(x) = (\text{known} + x)^3 - C \pmod N$. Since the unknown $x$ is small, LLL identifies the root and recovers the secret.

---

## Python Implementation: Simulating Håstad's Broadcast Attack ($e=3$)

Below is a complete Python implementation demonstrating the recovery of an encrypted message using Håstad's Broadcast Attack with three separate recipients and $e = 3$.

```python
import math
from functools import reduce

def extended_gcd(a, b):
    """Extended Euclidean Algorithm."""
    if a == 0:
        return b, 0, 1
    gcd, x1, y1 = extended_gcd(b % a, a)
    x = y1 - (b // a) * x1
    y = x1
    return gcd, x, y

def modular_inverse(a, m):
    """Computes the modular inverse of a modulo m."""
    gcd, x, _ = extended_gcd(a, m)
    if gcd != 1:
        raise ValueError("Modular inverse does not exist")
    return (x % m + m) % m

def chinese_remainder_theorem(items):
    """Applies Chinese Remainder Theorem to find x matching x = r_i (mod m_i)."""
    # items is a list of tuples (remainder, modulus)
    N = reduce(lambda acc, x: acc * x[1], items, 1)
    result = 0
    for r_i, m_i in items:
        n_i = N // m_i
        inv_ni = modular_inverse(n_i, m_i)
        result += r_i * n_i * inv_ni
    return result % N, N

def solve_cube_root(n):
    """Computes the exact integer cube root of an integer."""
    # Binary search to find exact root over large integers
    low = 0
    high = n
    while low <= high:
        mid = (low + high) // 2
        mid_cubed = mid ** 3
        if mid_cubed == n:
            return mid
        elif mid_cubed < n:
            low = mid + 1
        else:
            high = mid - 1
    return None

if __name__ == "__main__":
    # Secret plaintext message as integer
    secret_message = int.from_bytes(b"ROOT_ACCESS_KEY", byteorder="big")
    e = 3

    # Generate 3 separate moduli (N_1, N_2, N_3) simulating 3 separate recipients
    # Moduli are chosen as prime products for demonstration purposes
    p1, q1 = 1205166299, 1205166317
    N1 = p1 * q1
    
    p2, q2 = 1205166329, 1205166341
    N2 = p2 * q2

    p3, q3 = 1205166343, 1205166353
    N3 = p3 * q3

    # Ensure message fits within the moduli
    assert secret_message < N1 and secret_message < N2 and secret_message < N3

    # Encrypt the same message for the three recipients using e=3
    C1 = pow(secret_message, e, N1)
    C2 = pow(secret_message, e, N2)
    C3 = pow(secret_message, e, N3)

    print(f"Intercepted Ciphertext C1: {C1}")
    print(f"Intercepted Ciphertext C2: {C2}")
    print(f"Intercepted Ciphertext C3: {C3}")

    # Step 1: Apply CRT
    crt_input = [(C1, N1), (C2, N2), (C3, N3)]
    C_combined, N_combined = chinese_remainder_theorem(crt_input)

    print(f"\nReconstructed Ciphertext modulo (N1*N2*N3): {C_combined}")

    # Step 2: Compute pure integer cube root
    recovered_int = solve_cube_root(C_combined)
    assert recovered_int is not None, "Failed to compute clean cube root."

    # Convert back to string
    recovered_bytes = recovered_int.to_bytes((recovered_int.bit_length() + 7) // 8, byteorder="big")
    print(f"\nRecovered Plaintext: {recovered_bytes.decode('utf-8')}")
    
    if recovered_int == secret_message:
        print("Vulnerability verified: Plaintext extracted successfully without private keys!")
```

---

## Architectural Mitigations: OAEP Padding

To completely neutralize low-exponent weaknesses:

1. **Enforce $e = 65537$**: This value is prime, has low binary weight (requiring only 17 multiplications), and is large enough to resist direct root-extraction and broadcast attacks.
2. **Implement OAEP (Optimal Asymmetric Encryption Padding)**: Standard RSA encryption (PKCS#1 v1.5) is deterministic if there is no random padding. OAEP transforms the message using a Feistel network with cryptographic hash functions before modular exponentiation, ensuring each encryption yields a completely randomized, unique ciphertext:

$$\text{Ciphertext} = \text{OAEP}(m)^e \pmod N$$
