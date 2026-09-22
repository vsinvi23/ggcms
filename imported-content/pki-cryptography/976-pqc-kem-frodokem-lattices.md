# Post-Quantum Cryptography: FrodoKEM and the Conservative Security of Unstructured Lattices

## The Problem: The Impending Quantum Threat to Public-Key Schemes

The security of modern PKI systems rests on the hardness of two mathematical problems: Integer Factorization (RSA) and Discrete Logarithms (ECC, Diffie-Hellman). In 1994, Peter Shor published **Shor's Algorithm**, proving that a sufficiently powerful quantum computer can solve both of these problems in polynomial time. Once large-scale quantum computers are realized, all existing standard public-key cryptography will be obsolete.

In response, NIST initiated the Post-Quantum Cryptography (PQC) standardization process. The leading standardized Key Encapsulation Mechanism (KEM) is **Kyber (ML-KEM)**, which relies on structured lattices (specifically, the Module Learning with Errors problem). While structured lattices offer excellent performance and compact keys, their mathematical formulations contain algebraic structures (such as ideal polynomial rings). Some cryptographers warn that these algebraic properties could expose structured schemes to future, yet-unforeseen mathematical shortcuts.

---

## Architectural Blueprint: The Learning with Errors (LWE) Cryptosystem

To mitigate this algebraic risk, **FrodoKEM** was designed as a highly conservative alternative. It relies on the **standard, unstructured Learning with Errors (LWE)** problem. FrodoKEM does not use polynomial rings; instead, its security is grounded in standard, unstructured matrix multiplication with injected Gaussian noise.

```
       Kyber (Structured Lattice)                FrodoKEM (Unstructured Standard LWE)
+-----------------------------------------+    +------------------------------------------+
| - Uses cyclic/ideal polynomial rings    |    | - Uses standard generic random matrices  |
| - Fast, small key sizes                 |    | - No polynomial algebraic structure      |
| - Risk: Algebraic attack vectors        |    | - High key size but maximum security     |
+-----------------------------------------+    +------------------------------------------+
                                                    |
                                                    v (Security Equation)
                                        B = A * S + E  (mod q)
                                        - A: Public random matrix
                                        - S: Secret key matrix
                                        - E: Secret noise matrix (Gaussian)
```

The mathematical difficulty of LWE lies in recovering $S$ given $A$ and $B$. Without the noise matrix $E$, this is a simple linear algebra system solvable via Gaussian elimination. With $E$ injected, finding the secret becomes equivalent to finding the closest vector in a high-dimensional lattice (the Closest Vector Problem), which is an NP-hard problem.

---

## Robust Python Simulation of a Basic LWE Key Exchange

The following Python script implements a complete, self-contained **Learning with Errors (LWE) Key Encapsulation Mechanism**. It demonstrates the creation of the public parameters, key generation with Gaussian noise injection, encryption (encapsulation), and decryption (decapsulation) using error-correction rounding.

```python
import numpy as np
import secrets

class ToyLWEKEM:
    def __init__(self):
        # Parameters chosen to showcase the error tolerance logic of LWE
        self.n = 128     # Dimension of the secret vector
        self.q = 1024    # Modulus
        self.sigma = 3.0 # Standard deviation for noise generation

    def generate_noise(self, size):
        """Generates Gaussian noise rounded to the nearest integer modulo Q."""
        noise = np.random.normal(0, self.sigma, size)
        return np.round(noise).astype(int) % self.q

    def generate_keypair(self):
        """
        Generates public key (A, B) and private key S.
        B = A * s + e (mod q)
        """
        # A is a public random matrix
        A = np.random.randint(0, self.q, (self.n, self.n))
        
        # Secret vector s and noise vector e (small integers)
        s = np.random.randint(-5, 5, self.n) % self.q
        e = self.generate_noise(self.n)
        
        # Public key B = A * s + e
        B = (np.dot(A, s) + e) % self.q
        return (A, B), s

    def encrypt(self, public_key, bit_to_encrypt):
        """
        Encrypts a single bit (0 or 1) using LWE.
        Returns ciphertext (u, v).
        """
        A, B = public_key
        # Random binary choice vector r (representing coefficients)
        r = np.random.randint(0, 2, self.n)
        
        # Noise injection
        e1 = self.generate_noise(self.n)
        e2 = int(np.round(np.random.normal(0, self.sigma)))
        
        # Encrypted linear combination vectors
        u = (np.dot(r, A) + e1) % self.q
        
        # Inject secret bit: offset by q/2 if bit is 1
        message_offset = (bit_to_encrypt * (self.q // 2)) % self.q
        v = (np.dot(r, B) + e2 + message_offset) % self.q
        
        return u, v

    def decrypt(self, private_key, ciphertext):
        """
        Decrypts the ciphertext (u, v) using secret key s.
        Decoded bit is determined by rounding v - u * s.
        """
        s = private_key
        u, v = ciphertext
        
        # Compute decrypted signal value
        decrypted_val = (v - np.dot(u, s)) % self.q
        
        # Rounding logic: Check if decrypted value is closer to 0 or q/2
        diff_to_zero = min(decrypted_val, self.q - decrypted_val)
        diff_to_half = abs(decrypted_val - (self.q // 2))
        
        if diff_to_half < diff_to_zero:
            return 1
        return 0

# Execution Sandbox
if __name__ == "__main__":
    print("[*] Initializing Post-Quantum LWE KEM System...")
    lwe_kem = ToyLWEKEM()
    
    print("[*] Generating Post-Quantum Cryptographic Keypair...")
    pub_key, priv_key = lwe_kem.generate_keypair()
    print(f"    Public Matrix A dimensions: {pub_key[0].shape}")
    print(f"    Secret Vector s (first 10 elements): {priv_key[:10]}")
    
    # Encrypt a 1-bit secret
    secret_bit = 1
    print(f"[*] Encrypting secret bit: {secret_bit}")
    ciphertext = lwe_kem.encrypt(pub_key, secret_bit)
    
    # Decrypt ciphertext
    print("[*] Decrypting ciphertext using private key...")
    recovered_bit = lwe_kem.decrypt(priv_key, ciphertext)
    print(f"[+] Recovered Bit: {recovered_bit}")
    
    assert recovered_bit == secret_bit, "Decryption error tolerance failed!"
    
    # Encrypt a 0-bit secret
    secret_bit_zero = 0
    print(f"[*] Encrypting secret bit: {secret_bit_zero}")
    ciphertext_zero = lwe_kem.encrypt(pub_key, secret_bit_zero)
    recovered_bit_zero = lwe_kem.decrypt(priv_key, ciphertext_zero)
    print(f"[+] Recovered Bit: {recovered_bit_zero}")
    
    assert recovered_bit_zero == secret_bit_zero, "Decryption error tolerance failed!"
