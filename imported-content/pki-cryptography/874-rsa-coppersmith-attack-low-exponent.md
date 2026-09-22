# RSA Vulnerabilities: Coppersmith's Attack on Low Public Exponents (e=3)

## The Problem: The Trap of Fast RSA Decryption

To optimize encryption and signature verification performance, cryptographic libraries often use low public exponents ($e$) in RSA. The value $e = 65537$ ($2^{16} + 1$) is the current industry standard, but historical configurations or poorly optimized implementations sometimes use $e = 3$. 

While $e=3$ makes signature verification incredibly fast (requiring only two multiplications), it exposes the system to devastating polynomial-based attacks. 

If a sender encrypts a small message $M$ using $e=3$, and the message size is smaller than the modulus ($M^3 < N$), the ciphertext is simply $C = M^3 \pmod N \equiv M^3$. The security of RSA's mathematical trapdoor is lost; an eavesdropper can decrypt the message by calculating the real integer cube root $\sqrt[3]{C}$, completely bypassing the private key.

To prevent this, implementations use padding schemes like PKCS#1 v1.5. However, if an attacker knows a large portion of the message (e.g., they know the message format contains static headers like `"Recipient: Admin, Token: ..."`), the padding itself is not enough to protect the unknown part of the payload.

```text
          Attacker's Known Message Layout:
+------------------------------------------+-----------------------+
|  "Recipient: Admin, SessionKey: "        |  [ SECRET 128 BITS ]  |
+------------------------------------------+-----------------------+
|<---------- Known Plaintext ------------->|<-- Unknown variable ->|
                                                       |
                                                       v
                                            Find small integer root x_0
                                            using Coppersmith's LLL!
```

The challenge is: given a polynomial equation $f(x) \equiv 0 \pmod N$ where we know a target message is a root, can we find the small integer roots of this polynomial in polynomial time?

---

## The Solution: Coppersmith's Theorem and LLL Lattice Reduction

In 1996, Don Coppersmith proved that if we have a monic polynomial $f(x)$ of degree $e$ modulo an integer $N$ of unknown factorization, we can find all integer roots $x_0$ satisfying:
$$f(x_0) \equiv 0 \pmod N$$
provided that the root size is bounded by:
$$|x_0| < N^{1/e}$$

The attack converts the problem of solving a polynomial modulo $N$ into the problem of solving a polynomial over the real integers $\mathbb{Z}$. It does this by constructing a lattice of polynomials and running the **Lenstra-Lenstra-Lovász (LLL)** lattice basis reduction algorithm. LLL finds a short vector in the lattice, which corresponds to a new polynomial $g(x)$ that has the exact same integer roots $x_0$ as $f(x)$ but has coefficients so small that:
$$g(x_0) = 0 \text{ (over the real integers, without modulus } N \text{)}$$

Once the modulus is removed, solving $g(x) = 0$ is a trivial numerical root-finding exercise.

---

## Implementation: Simulating Coppersmith's Attack in Python

Below is a Python implementation demonstrating how a partially known message encrypted under $e=3$ can be broken by finding the unknown message root using LLL-based polynomial reductions.

```python
import numpy as np

def lll_reduction(matrix):
    # Standard Gram-Schmidt/LLL lattice reduction implementation
    # Used to find the short vector representing the polynomial g(x)
    m, n = matrix.shape
    b = matrix.astype(float).copy()
    mu = np.zeros((m, m))
    
    # Gram-Schmidt
    for i in range(m):
        for j in range(i):
            mu[i, j] = np.dot(b[i], b[j]) / np.dot(b[j], b[j])
            b[i] -= mu[i, j] * b[j]
            
    # LLL reduction step
    delta = 0.75
    i = 1
    while i < m:
        for j in range(i-1, -1, -1):
            if abs(mu[i, j]) > 0.5:
                matrix[i] -= round(mu[i, j]) * matrix[j]
                # Re-calculate GS
                b = matrix.astype(float).copy()
                for x in range(m):
                    for y in range(x):
                        mu[x, y] = np.dot(b[x], b[y]) / np.dot(b[y], b[y])
                        b[x] -= mu[x, y] * b[y]
        if np.dot(b[i], b[i]) >= (delta - mu[i, i-1]**2) * np.dot(b[i-1], b[i-1]):
            i += 1
        else:
            matrix[i], matrix[i-1] = matrix[i-1].copy(), matrix[i].copy()
            i = max(i-1, 1)
    return matrix

def coppersmith_attack_e3():
    # Public Modulus N
    N = 1000000000003  # Simplified prime-product modulus
    e = 3
    
    # Target Message structure: Known header + Secret Root (x_0)
    # Plaintext = Known_Offset + x_0
    known_offset = 123456789000
    secret_root = 123
    
    # Ciphertext C = (known_offset + secret_root)^e mod N
    C = pow(known_offset + secret_root, e, N)
    
    # Define polynomial f(x) = (known_offset + x)^3 - C = 0 mod N
    # f(x) = x^3 + 3*known_offset*x^2 + 3*(known_offset^2)*x + (known_offset^3 - C) = 0 mod N
    # f(x) = x^3 + a_2 * x^2 + a_1 * x + a_0 = 0 mod N
    
    a2 = (3 * known_offset) % N
    a1 = (3 * pow(known_offset, 2, N)) % N
    a0 = (pow(known_offset, 3, N) - C) % N
    
    # Upper bound for the secret root X < N^(1/e)
    # N^(1/3) ~ 10000. Our secret_root is 123, which is well within the bound.
    X = 10000
    
    # Construct the lattice basis matrix (Howell-style basis for degree e=3)
    # The short vector in this lattice will give us g(x) = 0 over integers
    lattice = np.array([
        [N, 0, 0, 0],
        [0, N*X, 0, 0],
        [0, 0, N*(X**2), 0],
        [a0, a1*X, a2*(X**2), X**3]
    ])
    
    reduced_lattice = lll_reduction(lattice)
    
    # Extract the coefficients of the shortest vector g(x)
    shortest_vector = reduced_lattice[0]
    
    # Solve for x over integers (simulated numeric root extraction for demonstrations)
    # g(x) = c3 * (x/X)^3 + c2 * (x/X)^2 + c1 * (x/X) + c0 = 0
    # In production, we'd use SageMath's .small_roots()
    for x_candidate in range(X):
        poly_eval = (shortest_vector[3] * (x_candidate**3) // (X**3)) + \
                    (shortest_vector[2] * (x_candidate**2) // (X**2)) + \
                    (shortest_vector[1] * x_candidate // X) + \
                    shortest_vector[0]
        if poly_eval % N == 0:
            print(f"[Attack Success] Secret root recovered: {x_candidate}")
            return
            
    print("Attack failed to find root.")

if __name__ == "__main__":
    coppersmith_attack_e3()
```

---

## Security Considerations and Mitigations

1. **Enforce $e = 65537$**:
   Always configure RSA keys with a public exponent of $e = 65537$ ($2^{16} + 1$). This value is large enough to render Coppersmith's root-bounding criteria ($N^{1/65537}$) mathematically impossible to meet for any real-world secret length, while still preserving fast signature verification.
2. **Adopt Optimal Asymmetric Encryption Padding (OAEP)**:
   Never use raw (textbook) RSA or simple deterministic padding. Secure RSA deployments must use **RSA-OAEP** (RFC 8017). OAEP is a feistel-network-based randomized padding scheme that provides plaintext-awareness (ciphertext cannot be modified or generated by an attacker).
3. **Transition to ECC**:
   Where feasible, migrate legacy RSA systems to Elliptic Curve Cryptography (ECDSA/Ed25519). ECC does not use public exponents, eliminating low-exponent algebraic attack pathways completely.
