# Homomorphic Encryption Libraries: Comparing Microsoft SEAL (BFV/CKKS) implementations

Homomorphic Encryption (HE) represents a holy grail in cryptography: the ability to compute on encrypted data without ever decrypting it. For decades, HE was a purely theoretical construct. Today, libraries like Microsoft SEAL (Simple Encrypted Arithmetic Library) have made it practical. However, navigating the landscape requires understanding the fundamental differences between its two primary schemes: BFV (Brakerski/Fan-Vercauteren) and CKKS (Cheon-Kim-Kim-Song).

## The Core Problem: Exact Arithmetic vs. Approximate Computing

Traditional encryption schemes like AES or RSA destroy the algebraic structure of the plaintext. If you multiply two AES ciphertexts, the result is garbage. HE preserves this structure by embedding the plaintext into noisy mathematical lattices (specifically, the Ring Learning With Errors, or RLWE, problem). 

However, mathematical operations inherently increase the "noise" within the ciphertext. If this noise grows too large, it corrupts the underlying message, rendering decryption impossible. The choice between BFV and CKKS dictates how this noise is managed and what type of data you can compute on.

*   **BFV:** Operates on modular arithmetic (integers). Computations are *exact*.
*   **CKKS:** Operates on real and complex numbers (floats). Computations are *approximate*.

## Mental Model: The Abacus vs. The Slide Rule

Think of BFV as a digital abacus. It counts discrete beads (integers). As long as you don't overflow the rods (exceed the noise budget), the final count is 100% perfectly exact. 

Think of CKKS as a slide rule. You can perform complex fractional calculations (like $3.1415 \times 2.718$), but the result is inherently subject to precision loss depending on how closely you read the tick marks. In CKKS, the cryptographic noise is treated symmetrically to rounding error in standard floating-point arithmetic.

## BFV: Exact Integer Arithmetic

In BFV, plaintexts are polynomials whose coefficients are integers modulo $t$. It is ideal for exact calculations: database lookups, secure voting, or precise financial transactions where being off by a fraction of a cent is unacceptable.

```cpp
// Microsoft SEAL C++ Example: BFV Setup
#include "seal/seal.h"
using namespace seal;

EncryptionParameters parms(scheme_type::bfv);
size_t poly_modulus_degree = 8192;
parms.set_poly_modulus_degree(poly_modulus_degree);

// Moduli dictate the noise budget
parms.set_coeff_modulus(CoeffModulus::BFVDefault(poly_modulus_degree));
// The plaintext modulus defines the integer field (e.g., modulo 1024)
parms.set_plain_modulus(1024); 

SEALContext context(parms);
```

When you multiply two ciphertexts in BFV, the noise grows significantly. If you multiply too many times (the multiplicative depth), you exceed the noise budget. To regain budget, you must choose larger parameters, which heavily impacts performance.

## CKKS: Approximate Real-Number Computing

CKKS revolutionized HE by supporting real numbers, making it the de-facto standard for Encrypted Machine Learning (e.g., neural network inference on encrypted medical data). 

Instead of an exact integer field, CKKS uses a scaling factor ($\Delta$). A float like $3.14$ is multiplied by $\Delta$ (e.g., $2^{40}$) and encoded as an integer polynomial. During multiplication, the scaling factor squares ($\Delta^2$). CKKS introduces a "Rescale" operation that drops the lowest bits of the ciphertext, effectively dividing the scaling factor back to $\Delta$ while simultaneously shedding the cryptographic noise.

```cpp
// Microsoft SEAL C++ Example: CKKS Setup
EncryptionParameters parms(scheme_type::ckks);
size_t poly_modulus_degree = 8192;
parms.set_poly_modulus_degree(poly_modulus_degree);

// Moduli chain setup is complex: dictates scaling factor and levels
parms.set_coeff_modulus(CoeffModulus::Create(poly_modulus_degree, { 60, 40, 40, 60 }));

SEALContext context(parms);
double scale = pow(2.0, 40); // The scaling factor Delta

// Encoding a float
CKKSEncoder encoder(context);
Plaintext plain;
encoder.encode(3.14159, scale, plain);
```

## Visualizing the CKKS Rescaling

```text
1. Encode & Encrypt: Message (M) * Scale (Δ) + Noise (e)
   C1 = M1*Δ + e1
   C2 = M2*Δ + e2

2. Multiply:
   C_mult = C1 * C2
   C_mult ≈ (M1*M2) * Δ² + [Massive Noise]

3. Rescale (Divide by Δ and drop low bits):
   C_rescaled ≈ (M1*M2) * Δ + [Small Noise]
```
*Note: Because the low bits containing the noise are truncated along with the extra scaling factor, the exact precision of $M1 \times M2$ is slightly altered, hence "approximate".*

## Making the Choice

When building a privacy-preserving application with Microsoft SEAL, the decision matrix is strictly data-driven. If your algorithm relies on non-linear functions (like Sigmoid or ReLU), you must approximate them using polynomials (like Taylor series) and execute them over floats—mandating CKKS. If you are doing precise aggregations, discrete state transitions, or exact string matching via polynomial encodings, BFV is your only mathematically sound choice.
