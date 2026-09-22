# RSA Vulnerabilities: Coppersmith's Attack on Low Public Exponents (e=3)

## The Problem: The Siren Song of Small Public Exponents

In the RSA cryptosystem, public key generation involves choosing a public exponent $e$, a prime factor pair $p$ and $q$, and calculating the modulus $N = p \cdot q$. The public key consists of the pair $(e, N)$.

To optimize the speed of encryption and signature verification, cryptographic engineers often select very small public exponents. The values $e = 3$ or $e = 17$ are mathematically appealing because they require only one or two modular squarings during exponentiation, compared to the fifteen squarings required by the industry standard $e = 65537$.

However, choosing a low public exponent like $e = 3$ exposes the cryptosystem to devastating polynomial root-finding attacks. If the exact same message is encrypted using $e = 3$ to multiple distinct recipients, or if an attacker gains access to a ciphertext where a significant portion of the plaintext is known (e.g., standard header packets), they can recover the entire plaintext in polynomial time using Coppersmith's methods without factoring the modulus $N$.

---

## Architectural Blueprint: Håstad's Broadcast Attack

When the same message $m$ is encrypted with public exponent $e = 3$ to three different recipients (with coprime moduli $N_1, N_2, N_3$), an attacker intercepts three distinct ciphertexts:

$$\begin{aligned}
C_1 &\equiv m^3 \pmod{N_1} \\
C_2 &\equiv m^3 \pmod{N_2} \\
C_3 &\equiv m^3 \pmod{N_3}
\end{aligned}$$

```
                +-------------------+
                | Plaintext Message |
                |        (m)        |
                +-------------------+
                 /        |        \
       (e=3, N_1)         |         (e=3, N_3)
       /                  |                  \
      v             (e=3, N_2)                v
+-----------+       +-----------+       +-----------+
|    C_1    |       |    C_2    |       |    C_3    |
+-----------+       +-----------+       +-----------+
      \                   |                   /
       \------------------+------------------/
                          |
                          v (Attacker Intercepts)
             [ Chinese Remainder Theorem ]
                          |
                          v
                Find x < N_1 * N_2 * N_3
                   s.t. x = m^3
                          |
                          v [ Exact Real Cube Root ]
                   Plaintext (m)
```

Because $m < N_i$ for all $i$, the product of the moduli $N_1 \cdot N_2 \cdot N_3$ is guaranteed to be strictly greater than $m^3$. Applying the **Chinese Remainder Theorem (CRT)** to the system of modular equations yields a value $x < N_1 \cdot N_2 \cdot N_3$ such that:
$$x \equiv m^3 \pmod{N_1 \cdot N_2 \cdot N_3}$$

Since $m^3 < N_1 \cdot N_2 \cdot N_3$, the modular reduction does not wrap around. Therefore, $x$ is exactly equal to $m^3$ in the integers. The attacker recovers the plaintext $m$ by computing a standard integer cube root, bypassing the security of RSA encryption entirely.

---

## Robust Python Implementation: Håstad's Broadcast Attack Simulation

The following Python script provides a complete mathematical simulation of Håstad's Broadcast Attack. It generates three secure RSA public keys with $e=3$ and different moduli, encrypts a sensitive secret string, and uses a modular CRT and integer root-finding algorithm to recover the plaintext.

```python
import secrets
from cryptography.hazmat.primitives.asymmetric import rsa

def extended_gcd(a, b):
    """Extended Euclidean Algorithm returning (g, x, y)."""
    if a == 0:
        return b, 0, 1
    gcd, x1, y1 = extended_gcd(b % a, a)
    x = y1 - (b // a) * x1
    y = x1
    return gcd, x, y

def modular_inverse(a, m):
    """Computes modular inverse of a modulo m."""
    gcd, x, _ = extended_gcd(a, m)
    if gcd != 1:
        raise ValueError("Modular inverse does not exist")
    return x % m

def solve_crt(remainders, moduli):
    """Solves the Chinese Remainder Theorem for a system of modular equations."""
    total_modulus = 1
    for m in moduli:
        total_modulus *= m
        
    x = 0
    for r, m in zip(remainders, moduli):
        m_i = total_modulus // m
        inv = modular_inverse(m_i, m)
        x = (x + r * m_i * inv) % total_modulus
    return x, total_modulus

def integer_cube_root(n):
    """Computes the exact integer cube root of n using Newton's method."""
    x = n
    while True:
        y = (2 * x + n // (x * x)) // 3
        if y >= x:
            return x
        x = y

# Execution Sandbox
if __name__ == "__main__":
    secret_message = b"SerenyaPrivateCryptoToken"
    message_int = int.from_bytes(secret_message, byteorder="big")
    print(f"[*] Raw Plaintext Integer: {message_int}")

    # Generate 3 independent RSA keys with e=3
    keys = []
    moduli = []
    ciphertexts = []
    
    print("[*] Generating 3 secure RSA keys with public exponent e=3...")
    for i in range(3):
        # Generate raw keys using cryptography library
        private_key = rsa.generate_private_key(
            public_exponent=3,
            key_size=2048
        )
        n = private_key.public_key().public_numbers().n
        moduli.append(n)
        
        # Verify message bounds to ensure CRT conditions hold
        if message_int >= n:
            raise RuntimeError("Message is too large for modulus!")
            
        # Encrypt: C = m^3 mod n
        c = pow(message_int, 3, n)
        ciphertexts.append(c)
        print(f"    Key {i+1} Modulus (first 20 chars): {str(n)[:20]}...")
        print(f"    Ciphertext {i+1} (first 20 chars): {str(c)[:20]}...")

    print("[*] Intercepting communications and applying CRT...")
    # Solve system of congruences
    crt_result, combined_modulus = solve_crt(ciphertexts, moduli)
    
    print("[*] Extracting real integer cube root...")
    recovered_int = integer_cube_root(crt_result)
    
    print(f"[+] Recovered Plaintext Integer: {recovered_int}")
    recovered_bytes = recovered_int.to_bytes((recovered_int.bit_length() + 7) // 8, byteorder="big")
    print(f"[+] Decrypted ASCII String: {recovered_bytes.decode('ascii')}")
    
    assert recovered_bytes == secret_message, "Mathematical recovery failed!"
