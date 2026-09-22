# Isogeny-Based Cryptography: The Fall of SIKE and the Search for Quantum-Safe Curves

## The Problem: The Key Size Crisis in PQC
Lattice-based algorithms (like ML-KEM) represent the pragmatic future of key encapsulation, but their public keys measure in the kilobytes. Classical elliptic curve cryptography (ECC) requires a mere 32 bytes for a public key. The holy grail of Post-Quantum Cryptography (PQC) is an algorithm that is quantum-resistant but maintains the ultra-compact key sizes of classical ECC.

For years, Isogeny-based cryptography—specifically Supersingular Isogeny Key Encapsulation (SIKE)—was the champion of this pursuit, boasting 330-byte public keys. Then, in 2022, it was obliterated.

## The Math: What is an Isogeny?
In classical ECC, you perform operations on the points *within* a single elliptic curve (e.g., adding Point P to Point Q). 
In Isogeny-based cryptography, you perform operations that transform *one entire curve into another curve*. 

An isogeny is a morphism (a rational map) between two elliptic curves that preserves the point at infinity (the group identity). Instead of walking across points on a curve, the cryptographic random walk occurs on an "Isogeny Graph" where the nodes are distinct supersingular elliptic curves, and the edges are the isogenies connecting them.

Finding a path between two massive, randomly selected curves in this graph is believed to be exceptionally difficult for both classical and quantum computers.

```text
[Curve E_start] ----(Isogeny phi_1)----> [Curve E_1] ----(Isogeny phi_2)----> [Curve E_2]
```

## The Fall of SIKE: The Castryck-Decru Attack
SIKE was a Round 4 candidate in the NIST PQC standardization process. It was considered the primary alternative to lattices. 

To make the Diffie-Hellman-like key exchange work, SIKE protocols needed to transmit auxiliary information—specifically, the images of certain torsion points under the secret isogeny. 
In July 2022, Wouter Castryck and Thomas Decru published an earth-shattering paper. They realized that this auxiliary point information, combined with a mathematical concept called "Richelot isogenies" and Kani’s theorem from genus-2 curve geometry, allowed them to algebraically reconstruct the secret isogeny path.

The attack did not require a quantum computer. A single-core classical CPU running a SageMath script broke SIKE-p434 (NIST Security Level 1) in **one hour**. SIKE was instantly dead.

### The Attack Conceptualized (SageMath Pseudo-Logic)
```python
# The Castryck-Decru attack logic simplified
def break_sike(E_start, E_pub, torsion_points):
    """
    E_start: Starting curve
    E_pub: Alice's public curve
    torsion_points: Auxiliary info Alice sent to Bob
    """
    # 1. Lift the 1-dimensional elliptic curves into a 2-dimensional 
    #    Abelian surface using the auxiliary torsion points.
    abelian_surface = construct_genus_2_surface(E_start, E_pub, torsion_points)
    
    # 2. Exploit Richelot isogenies on the 2D surface to bypass the hard 
    #    graph-walking problem of the 1D curves.
    secret_path = richelot_isogeny_chain(abelian_surface)
    
    # 3. Project back down to 1D to reveal the secret key
    return extract_private_key(secret_path)
```

## The Aftermath: CSIDH and SQIsign
The destruction of SIKE did not destroy all isogeny-based cryptography; it only destroyed schemes that transmit auxiliary torsion points. 

### 1. CSIDH (Commutative Supersingular Isogeny Diffie-Hellman)
CSIDH avoids the Castryck-Decru attack because it does not require auxiliary points. Instead of working over arbitrary degree isogenies, CSIDH uses the action of the ideal class group of an imaginary quadratic field on the set of supersingular curves over a prime field F_p. 
*   **Pros:** Public keys are incredibly small (64 bytes).
*   **Cons:** Very slow, and quantum computers run Shor's algorithm variant (subexponential time) against the class group action, requiring massive prime sizes to stay secure.

### 2. SQIsign (Signature Quantum with Isogenies)
Currently the most promising isogeny signature scheme. It produces signatures smaller than RSA (around 177 bytes). It leverages the Deuring correspondence, translating the hard geometric problem of finding isogenies into a purely algebraic quaternion algebra problem.
*   **Pros:** Smallest PQC signatures in existence.
*   **Cons:** Signing takes several seconds on a modern CPU, making it impractical for high-volume TLS servers, but highly relevant for static document or firmware signing.

Isogenies remain the most mathematically elegant and compact area of PQC, but the sheer complexity of genus-2 surfaces and quaternion algebra makes them the most hazardous to implement.