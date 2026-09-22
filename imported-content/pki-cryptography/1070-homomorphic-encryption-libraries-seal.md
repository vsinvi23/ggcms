# Homomorphic Encryption Libraries: Comparing Microsoft SEAL (BFV/CKKS) Implementations

## The Problem: Securing Data-in-Use

Traditional encryption mechanisms (AES, RSA) protect data at rest and data in transit. However, to perform any computation (such as running analytics, processing machine learning inferences, or running query matching), the data must first be decrypted in the server's memory. This exposes sensitive client data to rogue database administrators, platform vulnerabilities, and side-channel compromises.

**Homomorphic Encryption (HE)** solves this by allowing arbitrary mathematical computations to be executed directly on ciphertexts. The server computes:

$$\text{Decrypt}(\text{Evaluate}(C_x, C_y)) = f(x, y)$$

without ever knowing the secret key or the underlying plaintexts $x$ and $y$. Microsoft SEAL is a leading open-source library that implements two major homomorphic schemes: **BFV** (Brakerski-Fan-Vercauteren) and **CKKS** (Cheon-Kim-Kim-Song). Choosing the wrong scheme can degrade precision, balloon execution times, or lead to non-decryptable results due to noise growth.

---

## Architectural Comparison: BFV vs. CKKS

The primary architectural decision in homomorphic application design is selecting the correct arithmetization:

```
+----------------------------------------------------------------------------+
|                         HOMOMORPHIC SCHEME PARADIGMS                       |
+----------------------------------------------------------------------------+
|                                                                            |
|   [ BFV Scheme ]                                                           |
|   - Arithmetic: Exact integer arithmetic over finite rings $\mathbb{Z}_t$. |
|   - Best For: Database querying, exact counters, boolean gates, voting.   |
|   - Workflow:                                                              |
|     Integer -> Encode -> Encrypt -> Add/Mul -> Decrypt -> Decode -> Exact  |
|                                                                            |
|   [ CKKS Scheme ]                                                          |
|   - Arithmetic: Approximate real/complex floating-point numbers $\mathbb{C}$.|
|   - Best For: Machine learning, signal processing, statistical averages.   |
|   - Workflow:                                                              |
|     Float -> Encode -> Encrypt -> Scale/Mul -> Rescale -> Decrypt -> Approx|
|                                                                            |
+----------------------------------------------------------------------------+
```

### Noise Growth & Modulus Switching
In both schemes, ciphertexts are corrupted by a small amount of random **noise** to satisfy Ring Learning With Errors (RLWE) security. 
* **Multiplication** significantly increases this noise. If noise exceeds a predefined threshold, decryption fails.
* **BFV** manages noise using Relinearization and Modulus Switching, which reduces the ciphertext size back to its nominal dimensions after multiplications.
* **CKKS** treats this noise as part of the approximate calculation error. CKKS relies on a process called **Rescaling**, which drops a prime factor from the modulus chain, keeping the scale of the floating-point values constant while shedding noise.

---

## Mathematical Core: RLWE Foundations

Both BFV and CKKS operate over the cyclotomic polynomial ring $R = \mathbb{Z}[x]/(x^N + 1)$, where $N$ is a power of 2 (typically 4096, 8192, or 16384). A ciphertext consists of a pair of polynomials $(c_0, c_1) \in R_q^2$, where $q$ is the ciphertext modulus:

$$c_0 = - (c_1 \cdot s + e) + m \cdot \Delta \pmod q$$

where:
* $s \in R$ is the secret key.
* $e \in R$ is a small error polynomial.
* $m \in R$ is the plaintext message.
* $\Delta$ is a scaling factor used in BFV to separate message bits from noise bits.

---

## Code Implementation: Evaluating $(x + y) \cdot z$ in Microsoft SEAL (C++)

The following is a complete C++ program using Microsoft SEAL. It configures the BFV scheme, generates key pairs, encrypts inputs, performs a combined addition and multiplication, and validates the result.

```cpp
#include <iostream>
#include <vector>
#include "seal/seal.h"

using namespace std;
using namespace seal;

int main() {
    // 1. Configure Encryption Parameters
    EncryptionParameters parms(scheme_type::bfv);
    
    size_t poly_modulus_degree = 8192;
    parms.set_poly_modulus_degree(poly_modulus_degree);
    
    // Set Coeff Modulus using standard prime chains
    parms.set_coeff_modulus(CoeffModulus::BFVDefault(poly_modulus_degree));
    
    // Set Plaintext Modulus (t) - dictates exact integer space
    parms.set_plain_modulus(1024u32);

    // 2. Initialize Context
    SEALContext context(parms);
    if (!context.parameter_error_name().compare("valid")) {
        cout << "Parameters accepted by context." << endl;
    }

    // 3. Generate Keys
    KeyGenerator keygen(context);
    SecretKey secret_key = keygen.secret_key();
    PublicKey public_key;
    keygen.create_public_key(public_key);
    RelinKeys relin_keys;
    keygen.create_relin_keys(relin_keys); // Required for multiplication

    // 4. Instantiate Helpers
    Encryptor encryptor(context, public_key);
    Evaluator evaluator(context);
    Decryptor decryptor(context, secret_key);

    // 5. Encode and Encrypt Inputs: x = 5, y = 10, z = 3
    uint64_t val_x = 5;
    uint64_t val_y = 10;
    uint64_t val_z = 3;

    Plaintext plain_x(to_string(val_x));
    Plaintext plain_y(to_string(val_y));
    Plaintext plain_z(to_string(val_z));

    Ciphertext encrypted_x, encrypted_y, encrypted_z;
    encryptor.encrypt(plain_x, encrypted_x);
    encryptor.encrypt(plain_y, encrypted_y);
    encryptor.encrypt(plain_z, encrypted_z);

    // 6. Perform Homomorphic Evaluation: (x + y) * z
    Ciphertext encrypted_sum;
    evaluator.add(encrypted_x, encrypted_y, encrypted_sum); // (x + y)

    Ciphertext encrypted_prod;
    evaluator.multiply(encrypted_sum, encrypted_z, encrypted_prod); // (x + y) * z

    // Relinearize back to size 2 after multiplication to control noise growth
    Ciphertext final_encrypted;
    evaluator.relinearize(encrypted_prod, relin_keys, final_encrypted);

    // 7. Decrypt and Decode Result
    Plaintext plain_result;
    decryptor.decrypt(final_encrypted, plain_result);

    // BFV plaintexts can be parsed back directly to decimal string
    uint64_t result = stoull(plain_result.to_string(), nullptr, 16);
    cout << "Decrypted Result: " << result << endl;

    // Verify correctness: (5 + 10) * 3 = 45
    if (result == 45) {
        cout << "Homomorphic execution validated: Success!" << endl;
    } else {
        cerr << "Evaluation error! Expected 45, got " << result << endl;
        return 1;
    }

    return 0;
}
```

---

## Architectural Guidelines for Scheme Selection

| Metric | BFV | CKKS |
| :--- | :--- | :--- |
| **Data Types** | Finite exact integers ($\mathbb{Z}_t$) | Real and complex numbers ($\mathbb{R}, \mathbb{C}$) |
| **Arithmetic Precision** | Exact | Approximate (bounded relative error) |
| **Performance Overhead** | Moderate | High (due to frequent rescaling) |
| **Noise Management** | Modulus switching (discretionary) | Mandatory rescaling per multiplicative depth |
| **Best Target Applications**| Relational database search, equality checks | Neural network weight evaluation, linear regression |
