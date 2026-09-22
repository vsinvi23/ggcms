# Proactive Secret Sharing (PSS): Rotating Key Shares Without Changing the Root Secret

## The Problem: The Mobile Adversary in Threshold Cryptography

Shamir's Secret Sharing (SSS) is a foundational cryptographic algorithm that splits a root secret (like a Master Private Key) into $N$ distinct shares. The secret can only be reconstructed if a threshold of $M$ shares are combined. This distributes trust: no single server or administrator holds the full key.

However, SSS assumes a static threat model. If an advanced persistent threat (a "Mobile Adversary") breaches Server 1 in January, extracts its share, and then breaches Server 2 in March, they accumulate shares over time. Eventually, they will collect $M$ shares and reconstruct the root secret. 

To prevent this, the shares must expire. But how do you rotate the distributed shares without changing the root secret (which would require re-encrypting all underlying data) and without ever bringing the shares together on a single machine (which would create a single point of failure)?

## The Solution: Proactive Secret Sharing (PSS)

Proactive Secret Sharing extends SSS to defend against mobile adversaries. In PSS, the servers communicate with each other periodically (e.g., every 24 hours) to generate a completely new set of shares. The old shares are deleted. 

An attacker who stole a share yesterday finds it mathematically useless when combined with a share stolen today. 

### Technical Architecture: The Zero-Polynomial

SSS encodes the secret $S$ as the y-intercept (where $x=0$) of a random polynomial of degree $M-1$.
$P(x) = S + a_1x + a_2x^2 + \dots + a_{M-1}x^{M-1}$
Each server $i$ receives a share $y_i = P(i)$.

To rotate the shares without changing $S$, the network collaboratively generates a **Zero-Polynomial**, $Z(x)$. This is a random polynomial of the same degree ($M-1$), but its y-intercept is strictly $0$.
$Z(x) = 0 + b_1x + b_2x^2 + \dots + b_{M-1}x^{M-1}$

Each server $i$ receives a "sub-share" of this zero-polynomial, $z_i = Z(i)$. 
The server simply adds its existing share to the zero-polynomial share:
$y'_i = y_i + z_i = P(i) + Z(i)$

Because polynomial addition is linear, the new shares evaluate to a new polynomial $P'(x) = P(x) + Z(x)$.
Crucially, the y-intercept of the new polynomial remains exactly the same:
$P'(0) = P(0) + Z(0) = S + 0 = S$

The secret $S$ remains unchanged, but every individual share $y'_i$ is now completely different.

```text
    [Polynomial Shift via PSS]
    
    Y
    |      * New Share 1 (y'_1)
    |     / 
    |    * Old Share 1 (y_1)
    |   / 
    S--+---------------------- X
    |\  \
    | *  * New Share 2 (y'_2)
    |  \
    |   * Old Share 2 (y_2)
    
    The y-intercept (S) is anchored.
    The curve swings wildly around it.
```

## Implementation: Simulating a PSS Rotation

The following Python code demonstrates the mathematics of updating shares using a zero-polynomial over a finite field (using a prime modulus $q$).

```python
import random

# Finite field prime (must be larger than the secret)
PRIME = 2**127 - 1

def generate_polynomial(degree, intercept):
    """Generates a random polynomial of `degree` with a specific y-intercept."""
    coefficients = [intercept]
    for _ in range(degree):
        coefficients.append(random.randint(1, PRIME - 1))
    return coefficients

def evaluate_polynomial(poly, x):
    """Evaluates the polynomial at a given x using Horner's method."""
    result = 0
    for coeff in reversed(poly):
        result = (result * x + coeff) % PRIME
    return result

# 1. Initial SSS Setup (3-of-5 threshold)
M = 3
N = 5
SECRET = 999999999999

# Generate the original polynomial P(x)
P_poly = generate_polynomial(M - 1, SECRET)

# Distribute old shares to 5 servers
old_shares = {i: evaluate_polynomial(P_poly, i) for i in range(1, N + 1)}
print(f"Old Share for Server 1: {old_shares[1]}")

# 2. The PSS Rotation Phase
# Generate a Zero-Polynomial Z(x) where intercept is 0
Z_poly = generate_polynomial(M - 1, 0)

# Distribute zero-polynomial sub-shares
zero_shares = {i: evaluate_polynomial(Z_poly, i) for i in range(1, N + 1)}

# Servers independently update their shares: y'_i = y_i + z_i mod PRIME
new_shares = {}
for i in range(1, N + 1):
    new_shares[i] = (old_shares[i] + zero_shares[i]) % PRIME

print(f"New Share for Server 1: {new_shares[1]}")

# 3. Verification: Ensure the secret is still reconstructable
# (Reconstruction uses Lagrange interpolation, omitted for brevity, 
# but mathematically guaranteed by P'(0) = P(0) + Z(0) = SECRET)
```

## Secure Distributed Generation

In a real PSS system, you cannot trust a single "dealer" node to generate and distribute the zero-polynomial, as that dealer would temporarily know the entire zero-polynomial and could theoretically un-rotate the shares. 

Instead, every server acts as a dealer. Each server $j$ generates its own zero-polynomial $Z_j(x)$ and sends a sub-share $Z_j(i)$ to every other server $i$. Server $i$ then sums up all received zero-sub-shares and adds the result to its original share. This Multi-Party Computation (MPC) ensures that as long as at least one server behaves honestly and deletes its temporary values, the overall zero-polynomial remains unknowable to the attacker.
