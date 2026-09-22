# Proactive Secret Sharing (PSS): Rotating Key Shares Without Changing the Root Secret

Shamir's Secret Sharing (SSS) is a foundational cryptographic primitive that splits a root secret (like a master private key) into $n$ shares, requiring at least $k$ shares to reconstruct it. While brilliant, standard SSS suffers from a fatal flaw in long-lived systems: **Mobile Adversaries**. If an attacker slowly compromises $k$ servers over five years, stealing one share per year, they eventually reconstruct the master key. 

To defeat this, we need a mechanism to periodically invalidate old shares and issue new ones. However, we cannot simply decrypt the root secret to re-split it, as that creates a single point of failure. The solution is Proactive Secret Sharing (PSS), a method to cryptographically rotate shares *without ever reconstructing the root secret*.

## The Core Problem: The Degradation of Trust

In a standard threshold system (e.g., $3$-of-$5$), the shares are static. 
If Server A is hacked in 2023, Server B in 2024, and Server C in 2025, the attacker has 3 shares and wins. 

We need to refresh the shares periodically (e.g., every month). If the shares are refreshed, an attacker must compromise 3 servers *within the same one-month window*. A share from January is mathematically incompatible with a share from February.

## Mental Model: Adding Zero to the Secret

Imagine a bank vault requires 3 codes to open. The master combination is 100. 
The vault splits this into three shares using simple addition: $30 + 30 + 40 = 100$.

To rotate the shares without changing the vault's master combination, a dealer distributes a new set of numbers that sum to *zero*: $+5, -15, +10$.
The servers add these "zero-shares" to their existing shares:
*   Server 1: $30 + 5 = 35$
*   Server 2: $30 - 15 = 15$
*   Server 3: $40 + 10 = 50$

The new shares $(35, 15, 50)$ are completely different from the old ones, rendering old stolen shares useless. Yet, they still sum to the exact same root secret: $35 + 15 + 50 = 100$. 

PSS applies this exact logic, but instead of simple addition, it uses polynomials over finite fields.

## The Mathematics of PSS

In Shamir's Secret Sharing, the root secret $S$ is hidden as the y-intercept ($f(0)$) of a random polynomial $f(x)$ of degree $k-1$. 
$f(x) = S + a_1x + a_2x^2 + \dots + a_{k-1}x^{k-1} \pmod p$

Each server $i$ holds a share $y_i = f(i)$.

To proactively refresh the shares in a decentralized manner, the servers collaboratively generate a *zero-polynomial* $g(x)$. This is a polynomial where the y-intercept is strictly 0:
$g(x) = 0 + b_1x + b_2x^2 + \dots + b_{k-1}x^{k-1} \pmod p$

By definition, $g(0) = 0$.

During the refresh protocol, the servers securely distribute shares of this zero-polynomial among themselves. Server $i$ receives $g(i)$.
Server $i$ then updates its long-term share by adding the zero-share:
$y_i^{new} = f(i) + g(i)$

Because $(f+g)(0) = f(0) + g(0) = S + 0 = S$, the new shares still reconstruct the exact same master root secret $S$. However, because $b_1, b_2, \dots$ are entirely new random coefficients, the new points $y_i^{new}$ lie on a completely new curve. Mixing an old share $f(1)$ with a new share $y_2^{new}$ yields garbage.

## Code Demonstration: Generating a Zero-Polynomial

Here is a Python abstraction of adding a zero-polynomial to rotate shares in a $2$-of-$3$ system (degree 1, which is a line).

```python
import random

PRIME = 208351617316091241234326746312124448251235562226470491514186331217050270460481

# Original Secret (S) = 42
# Original Polynomial f(x) = 42 + 15x
shares_v1 = {
    1: (42 + 15 * 1) % PRIME, # 57
    2: (42 + 15 * 2) % PRIME, # 72
    3: (42 + 15 * 3) % PRIME  # 87
}

# Time to rotate! Generate a Zero-Polynomial g(x) = 0 + bx
b = random.randint(1, PRIME - 1) # Let's say b = 99
# g(x) = 0 + 99x

zero_shares = {
    1: (0 + 99 * 1) % PRIME, # 99
    2: (0 + 99 * 2) % PRIME, # 198
    3: (0 + 99 * 3) % PRIME  # 297
}

# Servers update their shares independently
shares_v2 = {
    1: (shares_v1[1] + zero_shares[1]) % PRIME, # 57 + 99 = 156
    2: (shares_v1[2] + zero_shares[2]) % PRIME, # 72 + 198 = 270
    3: (shares_v1[3] + zero_shares[3]) % PRIME  # 87 + 297 = 384
}
```

If we interpolate `shares_v2`, the y-intercept remains 42, but the curve is now $y = 42 + 114x$.

## Applicability in the Wild

Proactive Secret Sharing is the cornerstone of modern Multi-Party Computation (MPC) wallets and decentralized key management systems (like Torus or specialized blockchain custodians). By enforcing a protocol where servers generate and distribute zero-polynomials every 24 hours, the system forces attackers into an impossible race: they must fully compromise a majority of the globally distributed servers simultaneously, before the clock strikes midnight and their stolen data turns to dust.
