# Proactive Secret Sharing (PSS): Rotating Key Shares Without Changing the Root Secret

## The Problem: The Mobile Adversary Threat

To protect high-value root secrets (like CA private keys or cold wallet keys), organizations use **Shamir's Secret Sharing (SSS)**. This splitting mechanism divides a master secret $S$ into $n$ shares using a random polynomial of degree $t-1$. Any subset of $t$ shares can reconstruct $S$, while any $t-1$ shares reveal zero information about the secret.

While SSS protects against single-point-of-failure storage breaches, it is vulnerable to a **mobile adversary**. A mobile adversary is an attacker who systematically compromises storage nodes one by one over a long period. Even if the nodes are in different security zones, the attacker can:
1. Compromise Node A in Month 1 and steal Share 1.
2. Compromise Node B in Month 3 and steal Share 2.
3. Compromise Node C in Month 6 and steal Share 3.

Once the attacker accumulates $t$ shares, they reconstruct the master secret. Crucially, the root secret $S$ is static, meaning old shares remain perpetually valid.

---

## Architectural Blueprint: The Proactive Update Protocol

**Proactive Secret Sharing (PSS)** solves this vulnerability. PSS allows the share holders to execute a distributed protocol that **rotates and updates all shares** without changing or reconstructing the master secret $S$. After rotation, all previously stolen shares are rendered useless; the attacker must compromise $t$ nodes within a single epoch to reconstruct the secret.

```
       Epoch 1 (Vulnerable)                        Epoch 2 (Rotated)
+---------------------------------+        +---------------------------------+
|  Node 1: Holds Share S_1        |        |  Node 1: Holds Share S'_1       |
|  Node 2: Holds Share S_2        |        |  Node 2: Holds Share S'_2       |
|  Node 3: Holds Share S_3        | ---->  |  Node 3: Holds Share S'_3       |
|                                 |        |                                 |
|  Stolen: Share S_1 (By Attacker)|        |  S_1 cannot be combined with    |
|                                 |        |  S'_2 and S'_3!                 |
+---------------------------------+        +---------------------------------+
```

### The Mathematics of Share Rotation
During the update phase, each node $i$ generates a random polynomial $u_i(x)$ of degree $t-1$ such that the y-intercept is zero ($u_i(0) = 0$). This polynomial represents a **zero-sharing contribution**.
The node computes update values for every other node:
$$u_{i, j} = u_i(j) \pmod p$$

Node $i$ securely transmits $u_{i, j}$ to node $j$.
Once Node $j$ receives update values from all other nodes, it updates its share:
$$S'_j = S_j + \sum_{i=1}^n u_{i, j} \pmod p$$

Because the sum of all update polynomials evaluates to zero at $x=0$, the underlying secret remains unchanged, but the polynomial coefficients are fully randomized.

---

## Robust Python Implementation of Shamir's PSS

The following Python script implements a complete, self-contained Shamir's Secret Sharing $(3, 5)$ scheme with an automated Proactive Secret Sharing share rotation protocol.

```python
import secrets

class ProactiveSecretSharing:
    # 256-bit Prime field for modular arithmetic
    PRIME = 115792089237316195423570985008687907853269984665640564039457584007913129639937

    @classmethod
    def eval_poly(cls, poly, x):
        """Evaluates a polynomial at point x modulo PRIME."""
        result = 0
        for coeff in reversed(poly):
            result = (result * x + coeff) % cls.PRIME
        return result

    @classmethod
    def generate_shares(cls, secret, t, n):
        """Generates (t, n) Shamir shares for a secret."""
        # Polynomial coefficients: poly[0] = secret, rest are random
        poly = [secret] + [secrets.randbelow(cls.PRIME) for _ in range(t - 1)]
        shares = {i: cls.eval_poly(poly, i) for i in range(1, n + 1)}
        return shares

    @classmethod
    def generate_zero_shares(cls, t, n):
        """
        Generates a zero-sharing polynomial coefficients.
        Ensure poly_zero[0] = 0.
        """
        poly_zero = [0] + [secrets.randbelow(cls.PRIME) for _ in range(t - 1)]
        return {j: cls.eval_poly(poly_zero, j) for j in range(1, n + 1)}

    @classmethod
    def rotate_shares(cls, current_shares, t, n):
        """
        Executes Proactive Secret Sharing.
        Each node distributes zero-sharing evaluations to all other nodes.
        """
        # Create zero-sharing updates from each node
        updates = {i: cls.generate_zero_shares(t, n) for i in range(1, n + 1)}
        
        new_shares = {}
        for j in range(1, n + 1):
            sum_updates = 0
            for i in range(1, n + 1):
                sum_updates = (sum_updates + updates[i][j]) % cls.PRIME
            new_shares[j] = (current_shares[j] + sum_updates) % cls.PRIME
            
        return new_shares

    @classmethod
    def interpolate(cls, shares, x_target=0):
        """Lagrange interpolation to reconstruct secret at x_target."""
        xs = list(shares.keys())
        ys = list(shares.values())
        total = 0
        
        for i in range(len(xs)):
            xi, yi = xs[i], ys[i]
            num, denom = 1, 1
            for j in range(len(xs)):
                if i == j:
                    continue
                xj = xs[j]
                num = (num * (x_target - xj)) % cls.PRIME
                denom = (denom * (xi - xj)) % cls.PRIME
            # Compute modular inverse
            inv_denom = pow(denom, cls.PRIME - 2, cls.PRIME)
            lagrange_coeff = (num * inv_denom) % cls.PRIME
            total = (total + yi * lagrange_coeff) % cls.PRIME
            
        return total

# Execution Sandbox
if __name__ == "__main__":
    t, n = 3, 5
    secret_key = 987654321098765432101234567890
    print(f"[*] Original Master Secret: {secret_key}")

    print(f"[*] Generating Shamir ({t}, {n}) shares (Epoch 1)...")
    epoch_1_shares = ProactiveSecretSharing.generate_shares(secret_key, t, n)
    for k, v in epoch_1_shares.items():
        print(f"    Node {k} Share: {str(v)[:20]}...")

    # Attacker steals Node 1 share from Epoch 1
    stolen_epoch_1_share = {1: epoch_1_shares[1]}
    print("[!] Attacker stole Share 1 from Epoch 1.")

    print("\n[*] Rotating Shares via Proactive Secret Sharing (Transition to Epoch 2)...")
    epoch_2_shares = ProactiveSecretSharing.rotate_shares(epoch_1_shares, t, n)
    for k, v in epoch_2_shares.items():
        print(f"    Node {k} Share: {str(v)[:20]}...")

    # Reconstruct from Epoch 2 shares (Nodes 2, 3, 4)
    subset_epoch_2 = {2: epoch_2_shares[2], 3: epoch_2_shares[3], 4: epoch_2_shares[4]}
    reconstructed_secret = ProactiveSecretSharing.interpolate(subset_epoch_2)
    print(f"[+] Reconstructed Secret from Epoch 2: {reconstructed_secret}")
    assert reconstructed_secret == secret_key, "PSS Broke secret integrity!"

    # Attacker attempts to combine stolen Epoch 1 share with active Epoch 2 shares
    malicious_subset = {1: stolen_epoch_1_share[1], 2: epoch_2_shares[2], 3: epoch_2_shares[3]}
    failed_reconstruction = ProactiveSecretSharing.interpolate(malicious_subset)
    print(f"[-] Reconstructed Secret from Mixed Epoch Shares: {failed_reconstruction}")
    assert failed_reconstruction != secret_key, "Security bypass! Mixed shares reconstructed secret!"
    print("[+] Cryptographic security maintained: Stolen legacy shares are completely useless.")
