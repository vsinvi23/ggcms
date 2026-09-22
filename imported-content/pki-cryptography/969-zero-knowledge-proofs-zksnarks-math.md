# Zero-Knowledge Proofs (ZK-SNARKs): Verifying Secrets Without Revealing Them

## The Problem: The Exposure of Direct Secret Verification

In traditional system architectures, validating that a party knows a secret (such as a password, a private key, or an account balance threshold) requires the party to transmit either the secret itself or a cryptographic hash of it. This direct transmission model introduces critical security vectors:

1. **Database Leakage:** If the verifier's database is breached, stored hashes can be subjected to offline brute-force or dictionary attacks.
2. **Channel Interception:** MitM attacks or transient memory leaks at the application layer can expose the raw witness.
3. **Privacy Violation:** The prover must reveal their entire identity or data to prove a single attribute (e.g., proving solvency requires revealing the exact bank balance).

Standard cryptographic signatures (like ECDSA) prove possession of a private key but cannot easily be extended to prove arbitrary arithmetic relations—such as "I know an integer $x$ such that the SHA-256 hash of $x$ is $y$, and $x$ is within the range $[100, 1000]$"—without revealing $x$.

---

## Architectural Blueprint: The ZK-SNARK Pipeline

A **ZK-SNARK** (Zero-Knowledge Succinct Non-Interactive Argument of Knowledge) resolves this by transforming an arbitrary computation (represented as code) into a mathematical representation that can be verified in milliseconds.

```
+---------------------------------------------------------------------------------+
|                               Setup Phase (CRS)                                 |
| Code -> Arithmetic Circuit -> R1CS Matrices (A, B, C) -> QAP -> Proving/Ver Key |
+---------------------------------------------------------------------------------+
                                      |
                                      | (Proving Key, PK)
                                      v
+------------------------+      Proof Generation       +------------------------+
|   Prover (w, y)        | --------------------------> |   Verifier (y, pi)     |
|   - Private Witness w  |         [Proof pi]          |   - Public Input y     |
|   - Public Input y     |                             |   - Proof pi           |
+------------------------+                             +------------------------+
                                                                   |
                                                                   v
                                                       [Checks Bilinear Pairings]
                                                       - Returns TRUE/FALSE
```

The transformation pipeline is highly structured:
1. **Arithmetic Circuit:** The code is flattened into a network of addition and multiplication gates.
2. **R1CS (Rank-1 Constraint System):** The circuit is compiled into three matrices $A, B, C$ representing equations of the form $(A \cdot s) \circ (B \cdot s) = C \cdot s$, where $s$ is the witness vector.
3. **QAP (Quadratic Arithmetic Program):** Polynomial interpolation maps the R1CS constraints into a single polynomial relation $A(x) \cdot B(x) - C(x) = H(x) \cdot T(x)$, which holds if and only if the circuit constraints are satisfied.
4. **Bilinear Pairings:** Elliptic curve pairings ($e: G_1 \times G_2 \rightarrow G_T$) check this polynomial equality at a hidden secret point $s$, enabling non-interactive validation with extremely small proofs.

---

## The Mathematical Foundation

For a chosen elliptic curve, a pairing maps two group elements to a target group:
$$e(g_1^a, g_2^b) = e(g_1, g_2)^{ab}$$

This bilinear property allows a verifier to check the multiplication of hidden values. If the prover claims to know $a, b, c$ such that $a \cdot b = c$, the verifier checks:
$$e(g_1^a, g_2^b) = e(g_1^c, g_2^1)$$

---

## Robust Implementation: Non-Interactive Schnorr Proof of Knowledge

To demonstrate the core concept of Zero-Knowledge Proofs without the heavy compiler toolchains of SNARKs (like Groth16), the following Python script implements a complete, self-contained **Non-Interactive Schnorr Proof of Knowledge of a Discrete Logarithm** using the **Fiat-Shamir Heuristic**. 

The Prover proves knowledge of $x$ (private key) for $Y = g^x \pmod p$ without revealing $x$ in a single non-interactive transmission.

```python
import hashlib
import secrets

class SchnorrNIZKP:
    # 2048-bit MODP Group (RFC 3526 Group 14)
    P = int(
        "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1"
        "29024E088A67CC74020BBEA63B139B22514A08798E3404DD"
        "EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245"
        "E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED"
        "EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE45B3D"
        "C2007CB8A163BF0598DA48361C55D39A69163FA8FD24CF5F"
        "83655D23DCA3AD961C62F356208552BB9ED529077096966D"
        "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3B"
        "E39E772C180E86039B2783A2EC07A28FB5C55DF06F4C52C9"
        "DE2BCBF6955817183995497CED9564F6955817183995497C"
        "25C125F9C340F1F15222E421BB9EAA98835848C07C1860F5"
        "FFFE3F", 16
    )
    G = 2  # Generator
    Q = (P - 1) // 2  # Order of subgroup

    @classmethod
    def generate_keypair(cls):
        """Generates a private key x and public key Y."""
        x = secrets.randbelow(cls.Q - 1) + 1
        Y = pow(cls.G, x, cls.P)
        return x, Y

    @classmethod
    def prove(cls, private_key, public_key, identity_string):
        """
        Generates a non-interactive proof of knowledge of private_key.
        Computes commitment t = g^v mod P,
        Calculates challenge c = Hash(g || Y || t || ID),
        Calculates response r = (v - c * x) mod Q.
        """
        x = private_key
        Y = public_key
        
        # 1. Commit phase
        v = secrets.randbelow(cls.Q - 1) + 1
        t = pow(cls.G, v, cls.P)
        
        # 2. Challenge generation (Fiat-Shamir Heuristic)
        hasher = hashlib.sha256()
        hasher.update(str(cls.G).encode())
        hasher.update(str(Y).encode())
        hasher.update(str(t).encode())
        hasher.update(identity_string.encode())
        c = int(hasher.hexdigest(), 16) % cls.Q
        
        # 3. Response generation
        r = (v - (c * x)) % cls.Q
        return t, r

    @classmethod
    def verify(cls, public_key, identity_string, proof):
        """
        Verifies the proof (t, r) against the public_key.
        Checks if t == g^r * Y^c mod P.
        """
        Y = public_key
        t, r = proof
        
        # Reconstruct challenge c
        hasher = hashlib.sha256()
        hasher.update(str(cls.G).encode())
        hasher.update(str(Y).encode())
        hasher.update(str(t).encode())
        hasher.update(identity_string.encode())
        c = int(hasher.hexdigest(), 16) % cls.Q
        
        # Verification equation
        lhs = t
        rhs = (pow(cls.G, r, cls.P) * pow(Y, c, cls.P)) % cls.P
        
        return lhs == rhs

# Execution Sandbox Verification
if __name__ == "__main__":
    client_id = "user@serenya.org"
    print("[*] Generating secure keypair...")
    priv_key, pub_key = SchnorrNIZKP.generate_keypair()
    
    print("[*] Generating Zero-Knowledge Proof...")
    proof = SchnorrNIZKP.prove(priv_key, pub_key, client_id)
    
    print(f"    Commitment (t): {hex(proof[0])[:40]}...")
    print(f"    Response (r):   {hex(proof[1])[:40]}...")
    
    print("[*] Verifying proof...")
    is_valid = SchnorrNIZKP.verify(pub_key, client_id, proof)
    print(f"[+] Verification Result: {is_valid}")
    assert is_valid == True, "Valid proof failed verification!"
    
    # Attempt verification with tampered public key
    tampered_pub_key = pub_key + 1
    is_valid_tampered = SchnorrNIZKP.verify(tampered_pub_key, client_id, proof)
    print(f"[-] Tampered Verification Result: {is_valid_tampered}")
    assert is_valid_tampered == False, "Tampered validation bypass detected!"
