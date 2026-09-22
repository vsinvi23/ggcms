# Proactive Secret Sharing (PSS): Rotating Key Shares Without Changing the Root Secret

## The Problem: The Mobile Adversary and Slow Share Leakage

Shamir’s Secret Sharing (SSS) is a foundational cryptographic algorithm that splits a root secret $S$ (e.g., a master decryption key, root CA private key, or cryptocurrency wallet seed) into $n$ distinct shares. Under a $(t, n)$ threshold scheme, any $t$ shareholders can combine their shares to reconstruct $S$, while any group of $t-1$ or fewer shareholders learns absolutely nothing about $S$.

However, classic Shamir’s Secret Sharing has a critical architectural vulnerability: **shares are static**.

If the secret is stored for years, an active, persistent attacker (modeled as a "mobile adversary") has unlimited time to slowly compromise the servers or secure enclaves holding the shares one-by-one. If they compromise server A in year 1, server B in year 2, and server C in year 3, they eventually amass $t$ shares and reconstruct the secret.

**Proactive Secret Sharing (PSS)** neutralizes this threat. PSS allows the shareholders to periodically run an interactive protocol that generates a completely new set of shares. This process:
1. Validates that the root secret $S$ remains unchanged.
2. Updates every shareholder's share value so that **old shares become completely useless** and cannot be combined with new shares.
3. Performs the rotation without ever reconstructing or exposing the root secret $S$ during the update phase.

---

## Architectural Lifecycle: Static SSS vs. Proactive SSS

```
[ Static SSS: Vulnerable to Slow Leakage ]
Time T1: Share 1, Share 2, Share 3 ----(Attacker steals Share 1)
Time T2: Share 1, Share 2, Share 3 ----(Attacker steals Share 2)
Time T3: Attacker combines Stolen Share 1 (T1) + Stolen Share 2 (T2) -> RECONSTRUCTS SECRET!

[ Proactive SSS (PSS): Dynamic Rotation ]
Time T1: Share 1(v1), Share 2(v1), Share 3(v1) ----(Attacker steals Share 1(v1))
Time T2: [ PSS Share Rotation Protocol Runs ]
         Share 1(v2), Share 2(v2), Share 3(v2) ----(Attacker steals Share 2(v2))
Time T3: Attacker attempts to combine Share 1(v1) + Share 2(v2) -> FAILURE (Incompatible Polynomials!)
```

PSS enforces a epoch-based security model. To reconstruct the secret, the attacker must compromise $t$ share hosts *within a single epoch* (the time-window between rotations).

---

## Technical Core: Herzberg’s PSS Scheme

In Shamir's scheme, the secret $S$ is encoded as the $y$-intercept of a random polynomial of degree $t-1$:

$$f(x) = S + a_1 x + a_2 x^2 + \dots + a_{t-1} x^{t-1} \pmod p$$

To update the shares without changing the constant term $S$, we generate a random update polynomial $g(x)$ of the same degree $t-1$, but with a constant term of **exactly 0**:

$$g(x) = 0 + b_1 x + b_2 x^2 + \dots + b_{t-1} x^{t-1} \pmod p$$

We then add $f(x)$ and $g(x)$ together to yield a new polynomial $F(x)$:

$$F(x) = f(x) + g(x) = (S + 0) + (a_1 + b_1)x + \dots + (a_{t-1} + b_{t-1})x^{t-1} \pmod p$$

Since the constant term of $g(x)$ is 0, the constant term of the new polynomial $F(x)$ remains exactly $S$. The evaluated shares $F(i) = f(i) + g(i)$ are updated, but they reconstruct the same root secret.

---

## Python Implementation: Simulating Shamir SSS & Proactive Rotation

Below is a complete Python implementation showing a $(3, 5)$ threshold Shamir scheme. It demonstrates how to rotate the shares proactively, verify that new shares reconstruct the original secret, and prove that mixed shares from different epochs fail to decrypt the root.

```python
import random

# Use a secure prime for field arithmetic
PRIME = 2^127 - 1 # 170141183460469231731687303715884105727 (Mersenne Prime)

def eval_polynomial(poly, x):
    """Evaluates a polynomial (list of coefficients) at point x modulo PRIME."""
    result = 0
    for coeff in reversed(poly):
        result = (result * x + coeff) % PRIME
    return result

def lagrange_interpolation(shares):
    """Reconstructs the constant term (x=0) of the polynomial from coordinates."""
    xs, ys = zip(*shares)
    secret = 0
    for i in range(len(xs)):
        numerator = 1
        denominator = 1
        for j in range(len(xs)):
            if i == j:
                continue
            numerator = (numerator * (-xs[j])) % PRIME
            denominator = (denominator * (xs[i] - xs[j])) % PRIME
        
        # Compute modular inverse
        denom_inv = pow(denominator, PRIME - 2, PRIME)
        lagrange_coeff = (numerator * denom_inv) % PRIME
        secret = (secret + ys[i] * lagrange_coeff) % PRIME
    return secret

# --- SSS Setup ---
secret = 12345678901234567890  # Sensitive root secret
threshold = 3
num_shares = 5

# Generate random coefficients for degree 2 (threshold - 1)
# f(x) = S + a1*x + a2*x^2
poly_epoch_1 = [secret] + [random.randint(1, PRIME - 1) for _ in range(threshold - 1)]

# Distribute shares: (x, f(x))
shares_v1 = [(x, eval_polynomial(poly_epoch_1, x)) for x in range(1, num_shares + 1)]
print("Epoch 1 Shares:")
for s in shares_v1:
    print(f"  Node {s[0]}: {s[1]}")

# --- Proactive Share Rotation (PSS Epoch Transition) ---
# Generate update polynomial g(x) where g(0) = 0 (constant term is 0)
update_poly = [0] + [random.randint(1, PRIME - 1) for _ in range(threshold - 1)]

# Generate update values for each node
update_shares = [(x, eval_polynomial(update_poly, x)) for x in range(1, num_shares + 1)]

# Nodes apply the updates to their old shares: F(x) = f(x) + g(x)
shares_v2 = [(x, (v1 + v2) % PRIME) for (x, v1), (_, v2) in zip(shares_v1, update_shares)]

print("\nEpoch 2 Shares (After Proactive Rotation):")
for s in shares_v2:
    print(f"  Node {s[0]}: {s[1]}")

# --- Verification ---
# 1. Reconstruct using Epoch 1 shares (threshold met)
rec_v1 = lagrange_interpolation(shares_v1[:threshold])
assert rec_v1 == secret, "Epoch 1 reconstruction failed!"

# 2. Reconstruct using Epoch 2 shares (threshold met)
rec_v2 = lagrange_interpolation(shares_v2[:threshold])
assert rec_v2 == secret, "Epoch 2 reconstruction failed!"
print(f"\nVerification Success: Rotated shares successfully reconstruct same secret ({rec_v2}).")

# 3. Attacker tries to mix shares from Epoch 1 and Epoch 2
# e.g., combining Node 1 (v1) and Nodes 2 & 3 (v2)
mixed_shares = [shares_v1[0], shares_v2[1], shares_v2[2]]
forged_secret = lagrange_interpolation(mixed_shares)
print(f"Mixed Reconstruction attempt (Attack): {forged_secret}")
assert forged_secret != secret, "Security breach: mixed shares from different epochs reconstructed the secret!"
print("Security Verified: Mixing old and new shares yields completely corrupted noise.")
```

---

## Architectural Guidelines for Production PSS

To deploy PSS safely within zero-trust or multi-cloud infrastructures:

1. **Secure Inter-Node Communication**: During the rotation phase, nodes must transmit update polynomials over authenticated, encrypted TLS channels to prevent eavesdropping and MITM tampering.
2. **Commitment Verification (Verifiable Secret Sharing)**: Use **Feldman's Verifiable Secret Sharing (VSS)** scheme during the rotation. This allows nodes to cryptographically verify that the updates they receive are mathematically consistent with the original secret without learning any node's share, preventing malicious nodes from injecting bad update factors.
3. **Decentralized Epoch Scheduling**: Automate rotation epochs (e.g., every 24 hours) via cron tasks or Kubernetes operators to minimize the exposure window of any single share set.
