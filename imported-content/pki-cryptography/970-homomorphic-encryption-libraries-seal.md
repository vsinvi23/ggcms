# Homomorphic Encryption Libraries: Comparing Microsoft SEAL (BFV/CKKS) Implementations

## The Problem: Data Decryption During Cloud Computation

Cloud storage and processing platforms must typically decrypt sensitive datasets before executing functions or queries on them. This decrypt-to-compute step exposes cleartext data to several threats:

1. **Hypervisor and OS compromise:** An attacker with root access on the host node can scrape RAM or steal active encryption keys.
2. **Insider threats:** Malicious database administrators or host employees can intercept plaintext records.
3. **Regulatory compliance:** Storing and computing on raw health records (HIPAA) or credit card details (PCI-DSS) in public cloud environments presents massive legal and structural hurdles.

---

## Architectural Blueprint: Computation Over Ciphertexts

**Fully Homomorphic Encryption (FHE)** solves this problem by allowing computations directly on ciphertexts. The decrypted result of a calculation exactly matches the outcome that would have been obtained if the same operations were performed on plaintext.

```
+------------------------------------+                  +------------------------------------+
|            Client Node             |                  |       Untrusted Cloud Node         |
|  - Raw Data x, y                   |                  |  - Receives encrypted inputs       |
|  - Encrypts: Enc(x), Enc(y)        |                  |  - Evaluates arbitrary circuits    |
+------------------------------------+                  +------------------------------------+
                   |                                                       ^
                   | -------------[ Enc(x), Enc(y) ]-----------------------|
                   |                                                       |
                   |                                        [ Processing ]
                   |                                        - Enc(x) (+) Enc(y) = Enc(x + y)
                   |                                        - Enc(x) (*) Enc(y) = Enc(x * y)
                   |                                                       |
                   | <------------[ Enc(x * y) ]---------------------------+
                   v
|  - Decrypts ciphertexts            |
|  - Retrieves raw output (x * y)   |
+------------------------------------+
```

---

## BFV vs. CKKS: Choosing the Correct Scheme

Microsoft SEAL is an industry-leading library implementing two primary homomorphic encryption schemes:

### 1. BFV (Brakerski-Fan-Vercauteren)
- **Mathematical Basis:** Ring Learning with Errors (R-LWE) over cyclotomic polynomials.
- **Arithmetic Type:** Exact integer arithmetic over modular rings $\mathbb{Z}_{p^k}$.
- **Use Case:** Relational databases, exact counting, financial auditing, and logical gate routing.
- **Noise Control:** Noise increases on each multiplication. Relies on relinearization and modulus switching to manage growth, but decryption yields exact results as long as noise remains below the threshold.

### 2. CKKS (Cheon-Kim-Kim-Song)
- **Mathematical Basis:** Approximate Ring Learning with Errors.
- **Arithmetic Type:** Approximate floating-point arithmetic.
- **Use Case:** Machine learning inference, statistical modeling, neural networks, and physical sensor filtering.
- **Noise Control:** Plaintext is treated as a fractional value with a specific scale factor. Computation drops precision bit-by-byte, functioning similarly to floating-point rounding errors. Requires constant rescaling operations to maintain stability.

---

## Comparative Implementation

The following complete Python script simulates the internal mechanics and noise dynamics of Microsoft SEAL's BFV and CKKS schemes. It implements standard arithmetic operations (addition, multiplication) on encrypted vectors and showcases how noise scales during mathematical execution.

```python
import numpy as np

class ToyHomomorphicScheme:
    def __init__(self, scheme_type="BFV", scale=1024):
        self.scheme_type = scheme_type
        self.scale = scale if scheme_type == "CKKS" else 1
        # Simple simulation of parameters: Modulus Q and Ring dimension N
        self.q = 4294967296  # 32-bit Modulus
        self.key = 42        # Secret key

    def encrypt(self, value):
        """
        Simulates R-LWE Encryption:
        c = (a * s + e + message * scale) mod q, where 'e' is Gaussian noise.
        """
        a = np.random.randint(1, 1000)
        e = int(np.random.normal(0, 2))  # Small initial noise
        
        # Scaling plaintexts for approximate arithmetic in CKKS
        m = int(value * self.scale) if self.scheme_type == "CKKS" else int(value)
        c0 = (a * self.key + e + m) % self.q
        return {"c0": c0, "a": a, "noise": abs(e), "scheme": self.scheme_type}

    def add(self, ctx1, ctx2):
        """
        Homomorphic addition: c_add = c1 + c2.
        Noise grows linearly.
        """
        c0_res = (ctx1["c0"] + ctx2["c0"]) % self.q
        a_res = (ctx1["a"] + ctx2["a"]) % self.q
        noise_res = ctx1["noise"] + ctx2["noise"]
        return {"c0": c0_res, "a": a_res, "noise": noise_res, "scheme": self.scheme_type}

    def multiply(self, ctx1, ctx2):
        """
        Homomorphic multiplication:
        BFV: Multiplies and normalizes with modulus. Noise grows quadratically.
        CKKS: Multiplies scaled values; requires tracking new scale factor.
        """
        c0_res = (ctx1["c0"] * ctx2["c0"]) % self.q
        a_res = (ctx1["a"] * ctx2["a"]) % self.q
        
        # Multiplicative noise growth simulation
        noise_res = (ctx1["noise"] * ctx2["noise"]) + 10  # Added structural noise
        return {"c0": c0_res, "a": a_res, "noise": noise_res, "scheme": self.scheme_type}

    def decrypt(self, ctx):
        """
        Decryption: m = (c0 - a * key) mod q.
        """
        decrypted_scaled = (ctx["c0"] - ctx["a"] * self.key) % self.q
        # Adjusting modulus wrap-around
        if decrypted_scaled > self.q // 2:
            decrypted_scaled -= self.q
            
        if self.scheme_type == "CKKS":
            return decrypted_scaled / self.scale
        return decrypted_scaled

# Execute Comparative Test Run
if __name__ == "__main__":
    print("[*] Initializing BFV (Exact Integer) Scheme Simulation...")
    bfv = ToyHomomorphicScheme(scheme_type="BFV")
    v1_bfv = bfv.encrypt(15)
    v2_bfv = bfv.encrypt(3)
    
    add_bfv = bfv.add(v1_bfv, v2_bfv)
    mul_bfv = bfv.multiply(v1_bfv, v2_bfv)
    
    print(f"    BFV Add Decryption: {bfv.decrypt(add_bfv)} (Noise: {add_bfv['noise']})")
    print(f"    BFV Mul Decryption: {bfv.decrypt(mul_bfv)} (Noise: {mul_bfv['noise']})")
    
    print("\n[*] Initializing CKKS (Approximate Float) Scheme Simulation...")
    ckks = ToyHomomorphicScheme(scheme_type="CKKS", scale=1000)
    v1_ckks = ckks.encrypt(15.75)
    v2_ckks = ckks.encrypt(3.50)
    
    add_ckks = ckks.add(v1_ckks, v2_ckks)
    mul_ckks = ckks.multiply(v1_ckks, v2_ckks)
    
    print(f"    CKKS Add Decryption: {ckks.decrypt(add_ckks):.2f} (Noise: {add_ckks['noise']})")
    # Multiplicative scale needs normalization in actual libraries (via Rescaling)
    # Below shows how raw scale drifts on un-rescaled approximate multiply simulation
    raw_mul = ckks.decrypt(mul_ckks)
    print(f"    CKKS Raw Mul Result (Un-rescaled): {raw_mul:.2f}")
