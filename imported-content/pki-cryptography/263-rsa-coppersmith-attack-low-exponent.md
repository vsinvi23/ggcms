# RSA Vulnerabilities: Coppersmith's Attack on Low Public Exponents (e=3)

In the RSA cryptosystem, the public key consists of the modulus $N$ and the public exponent $e$. To optimize the performance of encryption and signature verification, developers historically gravitated toward exceptionally small values for $e$, specifically $e = 3$. While $e=3$ drastically reduces CPU cycles, it walks a razor-thin line regarding mathematical security. If padding is omitted or poorly implemented, a low exponent invites devastating algebraic attacks, most notably Coppersmith's theorem.

## The Core Problem: The Algebra of Low Exponents

RSA encryption is defined as $C \equiv M^e \pmod N$. 
When $e = 3$, this becomes $C \equiv M^3 \pmod N$.

If the message $M$ is small enough such that $M^3 < N$, the modulo operation never wraps around. The encryption ceases to be a cryptographic function and degrades into simple arithmetic. The attacker can simply compute the standard cube root of $C$ over the real numbers ($\sqrt[3]{C}$) to recover $M$, instantly breaking the encryption.

However, even if $M$ is padded so that $M^3 > N$, low exponents are still highly vulnerable to broadcast attacks and stereotyped messages.

## Mental Model: The Stereotyped Form

Imagine a company that encrypts daily reports. Every report starts with a predictable header: "CONFIDENTIAL DAILY REPORT: [Secret_Data]". 
If an attacker knows the first 90% of the plaintext (the stereotyped header), they only need to find the remaining 10%. Coppersmith's theorem proves that if a polynomial equation modulo $N$ has a small root, that root can be found efficiently. When $e=3$, the threshold for what constitutes a "small root" is remarkably forgiving.

## Håstad's Broadcast Attack

Before diving into Coppersmith, consider the simpler Håstad's Broadcast Attack. If a sender encrypts the *exact same* message $M$ (without random padding) and sends it to 3 different receivers using 3 different moduli ($N_1, N_2, N_3$), but the same $e=3$:

1. $C_1 \equiv M^3 \pmod{N_1}$
2. $C_2 \equiv M^3 \pmod{N_2}$
3. $C_3 \equiv M^3 \pmod{N_3}$

Using the Chinese Remainder Theorem (CRT), an attacker combines these into a single equation:
$C_{crt} \equiv M^3 \pmod{N_1 \times N_2 \times N_3}$

Because $M < N_i$, we know that $M^3 < N_1 \times N_2 \times N_3$. Therefore, the modulo drops away entirely. The attacker simply takes the integer cube root of $C_{crt}$ to recover $M$.

## Coppersmith's Attack on Stereotyped Messages

Coppersmith's attack is much stronger. It utilizes the Lenstra–Lenstra–Lovász (LLL) lattice basis reduction algorithm. It states that for a monic polynomial $f(x)$ of degree $d$ modulo $N$, we can efficiently find all roots $x_0$ such that $|x_0| < N^{1/d}$.

When $e=3$, the degree $d$ is 3. Therefore, an attacker can recover the unknown portion of a message as long as the unknown portion is smaller than $N^{1/3}$. For a standard 2048-bit RSA key, $N^{1/3}$ is roughly 682 bits (about 85 bytes). If your secret data is 85 bytes or less, and the rest of the message is known, $e=3$ is completely broken.

### Code Demonstration: SageMath

The attack is trivially implemented in SageMath, a computer algebra system built on Python that includes built-in Coppersmith methods via `.small_roots()`.

```python
# SageMath Script: Coppersmith Stereotyped Message Attack
# Assume a 2048-bit N, e=3
N = 189... # 2048-bit modulus
e = 3
C = 456... # Intercepted ciphertext

# Known stereotyped prefix: "API_KEY="
known_prefix = b"API_KEY="
# We shift the known prefix to the left to leave room for the 32-byte secret
# 32 bytes = 256 bits
shifted_prefix = int.from_bytes(known_prefix, 'big') << 256

# We construct the polynomial: f(x) = (shifted_prefix + x)^3 - C = 0 mod N
P.<x> = PolynomialRing(Zmod(N))
f = (shifted_prefix + x)^3 - C

# Coppersmith's method finds 'x' (the secret API key)
# epsilon helps tune the LLL algorithm
roots = f.small_roots(epsilon=0.03)

if roots:
    secret_int = roots[0]
    print("Recovered Secret:", int(secret_int).to_bytes(32, 'big'))
```

## The Mitigation: OAEP Padding and e=65537

The cryptography community universally addressed this by doing two things:
1. **Mandating OAEP Padding:** Optimal Asymmetric Encryption Padding (OAEP) introduces strong, randomized padding to every plaintext. It ensures $M$ is never stereotyped and never identical across broadcasts.
2. **Standardizing e=65537:** The value $2^{16} + 1$ (65537) is now the universally accepted default public exponent. It is large enough to render Coppersmith and Broadcast attacks computationally infeasible, but because its binary representation (`10000000000000001`) contains only two '1' bits, the square-and-multiply exponentiation algorithm executes extremely fast.
