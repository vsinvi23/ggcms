# Proactive Secret Sharing (PSS): Rotating Key Shares Without Changing the Root Secret

## The Problem: The Mobile Adversary in Threshold Schemes

Shamir's Secret Sharing (SSS) is a foundational cryptographic primitive that allows a master secret $S$ to be split into $n$ shares, such that any threshold $t$ of those shares can reconstruct $S$. SSS is highly effective against static attacks (such as a hardware failure on a single storage node).

However, SSS fails against a **Mobile Adversary**. A mobile adversary is an attacker who slowly, over a long period of time, moves through a network, compromising nodes one by one. If they compromise node 1 in month 1, node 2 in month 2, and node 3 in month 3, they will eventually accumulate $t$ shares. Even though the attacker never controlled $t$ nodes *simultaneously*, they can now reconstruct the master secret.

To prevent this, we could generate a completely new master secret and distribute new shares. But this is highly disruptive: it invalidates all existing encrypted backups, database rows, and digital signatures tied to the original secret.

The challenge is to rotate the shares on the storage nodes periodically, rendering old compromised shares completely useless, **without ever reconstructing, changing, or exposing the root secret $S$**.

---

## The Solution: Proactive Secret Sharing (PSS)

Proactive Secret Sharing (PSS) solves the mobile adversary problem by introducing periodic, decentralized share rotation. 

Suppose the master secret $S$ is shared using a polynomial $f(x)$ of degree $t-1$:
$$f(x) = s + a_1 x + a_2 x^2 + \dots + a_{t-1} x^{t-1}$$
where $f(0) = S$, and each node $i$ holds the share $y_i = f(i)$.

To rotate the shares, the nodes collaborate to generate a new polynomial $h(x) = f(x) + g(x)$, where $g(x)$ is a random **zero-secret polynomial** of degree $t-1$:
$$g(x) = 0 + b_1 x + b_2 x^2 + \dots + b_{t-1} x^{t-1}$$

Because $g(0) = 0$, the new polynomial $h(x)$ has the exact same y-intercept as the original polynomial:
$$h(0) = f(0) + g(0) = S + 0 = S$$

The root secret is perfectly preserved, but the coefficients are randomized, changing all individual share values $h(i)$ completely. If an attacker has compromised a share from the original polynomial $f(i)$, and a share from the updated polynomial $h(j)$, they cannot combine them; they must collect $t$ shares from the *same* generation window to reconstruct the secret.

```text
         PSS Polynomial Shift (Root Secret S is Anchored)
    y
    |
    |          Original Polynomial f(x)
    |             \          /
    |              \   * (f(i) Share)
    |               \ /
 S  *----------------*---------------------- (Anchor)
    |               / \
    |              /   * (h(i) Rotated Share)
    |             /     \
    |         Rotated Polynomial h(x) = f(x) + g(x)
    +-------------------------------------------> x
                     i (Node ID)
```

---

## Implementation: PSS Share Rotation in Python

Below is a Python implementation of Shamir's Secret Sharing integrated with a Proactive Secret Sharing share rotation protocol.

```python
import random

# Finite Field Prime
PRIME = 2**13 - 1  # 8191

def eval_polynomial(poly, x):
    # Evaluate polynomial at point x modulo PRIME
    result = 0
    for coef in reversed(poly):
        result = (result * x + coef) % PRIME
    return result

def generate_shares(secret, t, n):
    # Generate coefficients with secret as the constant term
    poly = [secret] + [random.randint(1, PRIME - 1) for _ in range(t - 1)]
    shares = {i: eval_polynomial(poly, i) for i in range(1, n + 1)}
    return shares

def generate_zero_update_shares(t, n):
    # Constant term is 0 to ensure secret remains unchanged
    zero_poly = [0] + [random.randint(1, PRIME - 1) for _ in range(t - 1)]
    update_shares = {i: eval_polynomial(zero_poly, i) for i in range(1, n + 1)}
    return update_shares

def reconstruct_secret(shares, t):
    # Lagrange Interpolation to find f(0)
    secret = 0
    selected_keys = list(shares.keys())[:t]
    
    for i in selected_keys:
        num = 1
        den = 1
        for j in selected_keys:
            if i == j:
                continue
            num = (num * (-j)) % PRIME
            den = (den * (i - j)) % PRIME
            
        lagrange_coef = (num * pow(den, PRIME - 2, PRIME)) % PRIME
        secret = (secret + shares[i] * lagrange_coef) % PRIME
        
    return secret

def run_pss_pipeline():
    secret = 42
    t, n = 3, 5
    
    print(f"[Init] Master Secret: {secret} (Threshold {t}-of-{n})")
    
    # 1. Distribute Initial Shares
    shares_gen_1 = generate_shares(secret, t, n)
    print(f"Gen 1 Shares: {shares_gen_1}")
    
    # Verify Reconstruction
    rec_gen_1 = reconstruct_secret(shares_gen_1, t)
    assert rec_gen_1 == secret
    
    # 2. PSS Rotation (Nodes collaborate to generate zero-update polynomial)
    # In practice, each node generates a zero-share set and sends segments to other nodes (Hermes/BFT)
    update_shares = generate_zero_update_shares(t, n)
    print(f"Zero-Secret Update Shares: {update_shares}")
    
    # Apply updates locally on each node: h(i) = f(i) + g(i) mod p
    shares_gen_2 = {}
    for i in range(1, n + 1):
        shares_gen_2[i] = (shares_gen_1[i] + update_shares[i]) % PRIME
        
    print(f"Gen 2 Rotated Shares: {shares_gen_2}")
    
    # 3. Prove Security Isolation
    # Mix and match of Gen 1 and Gen 2 must fail!
    mixed_shares = {1: shares_gen_1[1], 2: shares_gen_2[2], 3: shares_gen_2[3]}
    rec_mixed = reconstruct_secret(mixed_shares, t)
    print(f"Reconstruction using mixed generations (Should FAIL/Random): {rec_mixed}")
    assert rec_mixed != secret, "Security Isolation Failed! Mixed shares reconstructed secret!"
    
    # Reconstruction using clean Gen 2 shares must SUCCEED
    rec_gen_2 = reconstruct_secret(shares_gen_2, t)
    print(f"Reconstruction using rotated Gen 2 shares (Should SUCCEED): {rec_gen_2}")
    assert rec_gen_2 == secret, "Proactive rotation broke the master secret!"
    
    print("Success: Proactive Secret Sharing rotation completed securely!")

if __name__ == "__main__":
    run_pss_pipeline()
```

---

## Security Considerations and Protocol Flow

1. **Verifiable Secret Sharing (VSS)**:
   In a decentralized network, a malicious node could distribute garbage update shares $g(i)$ that do not evaluate to a polynomial with constant term 0, corrupting the master secret.
   * *Mitigation*: Integrate **Feldman's Verifiable Secret Sharing** or **Pedersen Commitments**. Nodes publish cryptographic commitments (elliptic curve points $g_k = g^{a_k}$) to their polynomial coefficients, allowing other nodes to mathematically verify their updates before applying them.
2. **Epoch Synchronization**:
   Nodes must coordinate when they transition to the next share generation. If some nodes are on Gen 1 and others are on Gen 2, signing protocols will fail.
   * *Mitigation*: Use consensus layers or strict epoch boundaries driven by secure time protocols (like NTP verified with Byzantine Agreement).
3. **Root Secret Integrity**:
   Since the master secret is never assembled in a single location during the update process, PSS maintains high resilience against cold-boot attacks on server memory.
