# Homomorphic Encryption Libraries: Comparing Microsoft SEAL (BFV/CKKS) Implementations

## The Problem: Data Privacy During Computation

Standard encryption schemes (AES, RSA) secure data at rest and in transit. However, to process or compute upon that data, it must first be decrypted in memory. This exposes the plaintext to memory-scraping malware, compromised host OS environments, and malicious insiders. 

When outsourcing computation to untrusted cloud environments, clients must either trust the cloud provider completely or utilize secure enclaves (Confidential Computing), which rely on complex hardware trust anchors. Fully Homomorphic Encryption (FHE) offers a purely cryptographic solution: it allows arbitrary computations directly on ciphertext, producing an encrypted result that, when decrypted, matches the outcome of the operations performed on the plaintext.

## The Solution: Fully Homomorphic Encryption (FHE)

FHE relies on lattice-based cryptography, utilizing the Ring Learning With Errors (RLWE) problem. In FHE, mathematical operations mapped over ciphertexts translate to algebraic operations over the underlying plaintext. 

FHE operations inject a small amount of "noise" into the ciphertext to guarantee security. As successive additions and multiplications occur, this noise grows. If the noise exceeds a threshold, the data cannot be decrypted. FHE schemes handle this via "bootstrapping"—a computationally heavy process that homomorphically decrypts the ciphertext to reduce its noise level without exposing the plaintext.

### Microsoft SEAL: BFV vs. CKKS

Microsoft SEAL (Simple Encrypted Arithmetic Library) is a leading open-source FHE library. It provides implementations of two primary FHE schemes: BFV (Brakerski-Fan-Vercauteren) and CKKS (Cheon-Kim-Kim-Song). Choosing between them depends entirely on the data types and precision requirements.

```text
+-----------------------+------------------------+
|       BFV Scheme      |       CKKS Scheme      |
+-----------------------+------------------------+
| Exact Integer Math    | Approximate Real Math  |
| Modular arithmetic    | Floating-point math    |
| Financial balances,   | Machine learning,      |
| Cryptographic hashes  | Statistical analysis   |
| Noise causes complete | Noise degrades         |
| data corruption       | decimal precision      |
+-----------------------+------------------------+
```

## BFV Architecture: Exact Arithmetic

The BFV scheme operates on integers modulo a plaintext modulus $t$. It is strictly exact. If you encrypt $2$ and $3$, and homomorphically multiply them, you get an encryption of exactly $6$.

### Code Implementation: BFV in Microsoft SEAL (C++)

Setting up BFV requires defining the degree of the polynomial modulus (`poly_modulus_degree`), which dictates security and maximum noise budget, and the coefficient modulus (`coeff_modulus`).

```cpp
#include "seal/seal.h"
#include <iostream>

using namespace std;
using namespace seal;

int main() {
    // 1. Setup Parameters for BFV
    EncryptionParameters parms(scheme_type::bfv);
    size_t poly_modulus_degree = 4096;
    parms.set_poly_modulus_degree(poly_modulus_degree);
    parms.set_coeff_modulus(CoeffModulus::BFVDefault(poly_modulus_degree));
    // Plaintext modulus determines the maximum size of integer values
    parms.set_plain_modulus(1024);

    SEALContext context(parms);

    // 2. Generate Keys
    KeyGenerator keygen(context);
    SecretKey secret_key = keygen.secret_key();
    PublicKey public_key;
    keygen.create_public_key(public_key);
    RelinKeys relin_keys;
    keygen.create_relin_keys(relin_keys);

    // 3. Encryptor, Evaluator, Decryptor
    Encryptor encryptor(context, public_key);
    Evaluator evaluator(context);
    Decryptor decryptor(context, secret_key);

    // 4. Encrypt Data
    Plaintext plain1("5");
    Plaintext plain2("7");
    Ciphertext encrypted1, encrypted2;
    encryptor.encrypt(plain1, encrypted1);
    encryptor.encrypt(plain2, encrypted2);

    // 5. Homomorphic Computation (Encrypted1 * Encrypted2)
    Ciphertext encrypted_result;
    evaluator.multiply(encrypted1, encrypted2, encrypted_result);
    // Relinearize after multiplication to reduce ciphertext size
    evaluator.relinearize_inplace(encrypted_result, relin_keys);

    // 6. Decrypt Result
    Plaintext plain_result;
    decryptor.decrypt(encrypted_result, plain_result);
    
    // Output should be 35 (in hex format by default, 0x23)
    cout << "Decrypted result: " << plain_result.to_string() << endl;

    return 0;
}
```

## CKKS Architecture: Approximate Arithmetic

Unlike BFV, CKKS treats encrypted values as real numbers (floating-point). It intentionally discards lower-order bits during multiplication via an operation called "rescaling" to manage noise. This rescaling means CKKS provides *approximate* results. Multiplying $2.0$ and $3.0$ might decrypt to $5.9999998$.

CKKS is heavily utilized in privacy-preserving machine learning inference, where neural networks inherently tolerate minor precision loss.

### Code Implementation: CKKS Encoding

CKKS setup utilizes a scaling factor (`scale`) to determine decimal precision.

```cpp
// 1. Setup Parameters for CKKS
EncryptionParameters parms(scheme_type::ckks);
size_t poly_modulus_degree = 8192;
parms.set_poly_modulus_degree(poly_modulus_degree);
parms.set_coeff_modulus(CoeffModulus::Create(poly_modulus_degree, { 60, 40, 40, 60 }));

SEALContext context(parms);
KeyGenerator keygen(context);
// ... generate keys ...

// 2. CKKSEncoder for floating point numbers
CKKSEncoder encoder(context);
double scale = pow(2.0, 40);

Plaintext plain1, plain2;
// Encode double values into plaintexts
encoder.encode(2.5, scale, plain1);
encoder.encode(3.2, scale, plain2);

// 3. Compute and Decrypt
Ciphertext encrypted1, encrypted2, encrypted_result;
encryptor.encrypt(plain1, encrypted1);
encryptor.encrypt(plain2, encrypted2);

evaluator.multiply(encrypted1, encrypted2, encrypted_result);
evaluator.relinearize_inplace(encrypted_result, relin_keys);
evaluator.rescale_to_next_inplace(encrypted_result);

Plaintext plain_result;
decryptor.decrypt(encrypted_result, plain_result);

vector<double> result;
encoder.decode(plain_result, result);
// Output will be ~8.0000
cout << "Result: " << result[0] << endl;
```

## Performance and Complexity Overhead

FHE is not a drop-in replacement for standard computation. 
1. **Ciphertext Expansion**: A 4-byte integer encrypted with SEAL can expand to several megabytes, resulting in massive network bandwidth overhead.
2. **Computational Latency**: Homomorphic multiplication is orders of magnitude slower than unencrypted CPU instructions. 
3. **Depth Limitations**: Without bootstrapping, you are restricted to "Leveled" Homomorphic Encryption, meaning you can only perform a predetermined depth of multiplications before noise destroys the data. 

When adopting Microsoft SEAL, developers must meticulously track the noise budget using `decryptor.invariant_noise_budget(ciphertext)` and design arithmetic circuits that minimize multiplicative depth.
