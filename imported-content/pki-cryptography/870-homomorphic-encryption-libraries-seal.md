# Homomorphic Encryption Libraries: Comparing Microsoft SEAL (BFV/CKKS) Implementations

## The Problem: The Privacy-Utility Trade-Off in Cloud Computing

When outsourcing data analysis to cloud providers, companies face a zero-sum choice between utility and privacy. Traditional encryption schemes like AES protect data in transit and at rest, but the data must be decrypted in memory before it can be processed. During this decryption window, the data is vulnerable to memory scraping, rogue hypervisors, and insider threats.

If a financial institution wants to query a cloud-hosted fraud detection model with customer transaction histories, or if a hospital wants to run genomic diagnostics on patient records, they must expose their sensitive raw plaintext to the cloud provider. 

The challenge is to perform mathematical computations directly on ciphertext, yielding an encrypted result that, when decrypted by the data owner, matches the output of the same computation performed on the plaintext.

## The Solution: Fully Homomorphic Encryption (FHE) with Microsoft SEAL

Microsoft SEAL (Simple Encrypted Arithmetic Library) is a high-performance, open-source homomorphic encryption library that implements two primary mathematical schemes designed for different data types: BFV (Brakerski-Fan-Vercauteren) and CKKS (Cheon-Kim-Kim-Song).

```text
       Plaintext Data (Hospital)                Cloud Provider (No Plaintext Access)
+-------------------------------------+      +-----------------------------------------+
| Patient Data m1, m2                 |      |                                         |
|                                     |      |                                         |
|      Encrypt(m1, pk) ---> Ciphertext c1 ---> Ciphertext c1                           |
|      Encrypt(m2, pk) ---> Ciphertext c2 ---> Ciphertext c2                           |
|                                     |      |                                         |
|                                     |      |  Homomorphic Eval:                      |
|                                     |      |  c_out = c1 * c2 + c2                   |
|                                     |      |                                         |
|      Decrypt(c_out, sk) <-- c_out <--------- Ciphertext c_out                        |
|             |                       |      |                                         |
|             v                       |      +-----------------------------------------+
|      Result (m1 * m2 + m2)          |
+-------------------------------------+
```

### The Mathematical Split: BFV vs. CKKS

The choice between BFV and CKKS is determined by the nature of the application:

1. **BFV (Exact Integer Arithmetic)**: 
   * Operates on integers in finite fields. 
   * Calculations are exact (no precision loss).
   * Ideal for relational databases, set intersections, integer accounting, and logical queries.
   * Modulus switching is used primarily to reduce noise growth without altering the underlying message.

2. **CKKS (Approximate Floating-Point Arithmetic)**:
   * Operates on complex numbers and real numbers.
   * Calculations are approximate, mimicking floating-point performance. Each computation adds a small amount of error, which must be tracked.
   * Ideal for machine learning inference, statistical modeling, neural networks, and physical signal processing.
   * Requires a dedicated **Rescaling** step after multiplication to maintain a consistent scale factor.

### Noise Management in FHE

Both BFV and CKKS are based on the Learning with Errors (LWE) problem. Ciphertexts contain a small amount of noise that increases with every multiplication operation. If the noise grows beyond a certain threshold defined by the encryption parameters (polynomial modulus degree $N$ and coefficient modulus $q$), decryption will fail, resulting in corrupted output. 

* **Relinearization**: Each homomorphic multiplication increases the size of the ciphertext from 2 to 3 components. Relinerization reduces the size back to 2, mitigating future noise growth.
* **Rescaling (CKKS Only)**: Divides the ciphertext by a prime factor of the coefficient modulus, throwing away the unneeded lowest-significant bits of noise.

---

## Implementation: CKKS Approximate Multiplication in Python

Below is a Python implementation (simulating Microsoft SEAL's CKKS API via homomorphic abstractions) demonstrating how real numbers are encoded, encrypted, multiplied homomorphically, rescaled, and decrypted.

```python
import math
import numpy as np

class MockCKKSCiphertext:
    def __init__(self, value, scale, noise_level):
        self.value = value
        self.scale = scale
        self.noise_level = noise_level

class MockCKKSEvaluator:
    @staticmethod
    def multiply(c1, c2):
        # Homomorphic multiplication multiplies values and scales
        new_val = c1.value * c2.value
        new_scale = c1.scale * c2.scale
        new_noise = c1.noise_level + c2.noise_level + 1.2  # Noise growth model
        return MockCKKSCiphertext(new_val, new_scale, new_noise)

    @staticmethod
    def add(c1, c2):
        if abs(c1.scale - c2.scale) > 1e-9:
            raise ValueError("Scales must match for addition")
        new_val = c1.value + c2.value
        new_noise = max(c1.noise_level, c2.noise_level) + 0.1
        return MockCKKSCiphertext(new_val, c1.scale, new_noise)

    @staticmethod
    def rescale_to_next(ciphertext, prime_factor):
        # Simulate SEAL's rescale_to_next_in_place
        ciphertext.value = ciphertext.value / prime_factor
        ciphertext.scale = ciphertext.scale / prime_factor
        ciphertext.noise_level -= 0.5  # Lower bits thrown away, noise drops
        return ciphertext

def run_homomorphic_pipeline():
    # SEAL CKKS Params
    initial_scale = 2**40
    prime_factor = 2**40
    
    # 1. Plaintext Data
    patient_weight = 72.5
    dosage_multiplier = 1.35
    
    print(f"[Plaintext] Patients Weight: {patient_weight}, Multiplier: {dosage_multiplier}")
    
    # 2. Encode & Encrypt (Proving preservation of floating-point precision)
    c_weight = MockCKKSCiphertext(patient_weight * initial_scale, initial_scale, noise_level=1.0)
    c_mult = MockCKKSCiphertext(dosage_multiplier * initial_scale, initial_scale, noise_level=1.0)
    
    # 3. Cloud Evaluation: c_res = c_weight * c_mult
    evaluator = MockCKKSEvaluator()
    c_res = evaluator.multiply(c_weight, c_mult)
    print(f"[Cloud Multiplied] Scale: {c_res.scale} (2^80), Noise: {c_res.noise_level:.2f}")
    
    # 4. Cloud Rescaling (To prevent exponential scale and noise explosion)
    c_res_rescaled = evaluator.rescale_to_next(c_res, prime_factor)
    print(f"[Cloud Rescaled] Scale: {c_res_rescaled.scale} (2^40), Noise: {c_res_rescaled.noise_level:.2f}")
    
    # 5. Client Decryption
    decrypted_val = c_res_rescaled.value / c_res_rescaled.scale
    expected = patient_weight * dosage_multiplier
    
    print(f"[Decrypted Result] {decrypted_val:.4f}")
    print(f"[Expected Plaintext Result] {expected:.4f}")
    assert math.isclose(decrypted_val, expected, rel_tol=1e-5)
    print("Success: CKKS approximation perfectly preserved!")

if __name__ == "__main__":
    run_homomorphic_pipeline()
```

---

## Security Considerations and Parameters Tuning

1. **The Choice of Polynomial Modulus Degree ($N$)**:
   To secure an FHE scheme against lattice reduction attacks (like LLL or BKZ), $N$ must scale with the size of the coefficient modulus $q$. Standard parameters for 128-bit security require:
   * $N = 8192 \implies \log q \le 218$
   * $N = 16384 \implies \log q \le 438$
   * Choosing a larger $N$ increases security and maximum noise budget, but dramatically slows down computation performance.
2. **Circular Security**:
   CKKS and BFV rely on the assumption of circular security under LWE, especially when public keys are used to encrypt their own secret keys (bootstrapping).
3. **Information Leakage via Decryption**:
   CKKS ciphertexts leak some information if the client acts as a decryption oracle. Since CKKS results are approximate, the differences between consecutive decryption outputs can reveal the secret key over time.
   * *Mitigation*: Ensure clients never expose high-precision decryption differences to untrusted parties, or add small Gaussian noise during decryption.
