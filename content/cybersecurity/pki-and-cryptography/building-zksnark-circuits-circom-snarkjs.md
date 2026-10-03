---
title: "Building ZK-SNARK Circuits with Circom and SnarkJS"
description: "A practical walkthrough of writing an arithmetic circuit in Circom, running the Groth16 trusted setup, and generating and verifying a real ZK-SNARK proof with snarkjs in Node.js — plus the circuit-auditing pitfalls that turn a working proof into a security hole."
type: "ARTICLE"
categorySlug: "pki-cryptography"
articleType: "GUIDE"
tags:
  - "zk-snarks"
  - "circom"
  - "snarkjs"
  - "groth16"
  - "trusted-setup"
  - "circuit-auditing"
  - "zero-knowledge-proofs"
---

# Building ZK-SNARK Circuits with Circom and SnarkJS

## The Problem: From Math to a Deployable Proof

Understanding that a computation can be flattened into an arithmetic circuit, translated into an R1CS, and compressed into a QAP explains *why* ZK-SNARKs work. It doesn't tell you how to actually ship one. A team building a real feature — "prove you know two secret factors without revealing them," "prove your balance exceeds a threshold," "prove you hold a valid credential" — needs a concrete toolchain: a language to express the circuit, a way to run the one-time trusted setup, and a runtime to generate and verify proofs in an application.

This article picks up exactly where the underlying R1CS/QAP theory leaves off and walks through the practical side: writing a circuit in **Circom** (the dominant circuit description language for Groth16/PLONK-style SNARKs) and driving the proving/verification lifecycle with **snarkjs** in Node.js.

## The Solution: The Circom + SnarkJS Toolchain

A ZK-SNARK proving pipeline built on Circom has three concrete phases, each a real command or API call rather than an abstract math step:

```text
+----------------+                            +------------------+
|    Prover      |                            |     Verifier     |
|                |                            |                  |
|  Secret (w) ----+                           |                  |
|                 |                           |                  |
|  Public (x) ----+---> [Circuit C(x,w)]      |                  |
|                 |          |                |                  |
|                 |          v                |                  |
|                 |    Generate Proof pi       |                  |
|                 |          |                |                  |
+----------------+          |                +------------------+
                            |                         |
                            +------- Proof pi ------->|
                                                      |
                                                      v
                                              [Verify(pi, x, vkey)]
                                                      |
                                                      v
                                                 True / False
```

1. **Circuit definition (Circom):** you write the constraint logic — what the prover must satisfy — in a small domain-specific language that compiles down to the R1CS the underlying SNARK protocol needs.
2. **Trusted setup + key generation (snarkjs):** a one-time (per-circuit, for Groth16) ceremony produces a proving key and a verification key from the compiled circuit.
3. **Prove and verify (snarkjs):** the prover runs the circuit against a witness (public + secret inputs) to produce a proof; the verifier checks that proof against the public inputs and the verification key, never seeing the secret witness.

## Writing the Circuit in Circom

Below is a circuit proving knowledge of two secret factors `a` and `b` whose product, once hashed, matches a public hash value — without ever revealing `a` or `b` to the verifier. This is the "I know the factors of this number" class of statement generalized to a hashed commitment.

```circom
pragma circom 2.0.0;

include "node_modules/circomlib/circuits/mimcsponge.circom";

// Proves knowledge of a and b such that MiMC(a * b) = public_hash
template SecretFactorization() {
    // Secret inputs (witness) -- never revealed to the verifier
    signal input a;
    signal input b;

    // Public input -- known to both prover and verifier
    signal input public_hash;

    // Intermediate signal
    signal product;

    // Constrain the product -- this becomes one row in the R1CS
    product <== a * b;

    // Hash the product using a SNARK-friendly hash function
    component mimc = MiMCSponge(1, 220, 1);
    mimc.ins[0] <== product;
    mimc.k <== 0;

    // Constrain the hash output to equal the public hash
    public_hash === mimc.outs[0];
}

component main {public [public_hash]} = SecretFactorization();
```

A few details that matter in practice:

- **`<==` is a constraint, not just an assignment.** Every `<==` line becomes a row in the R1CS matrices from the underlying theory — `product <== a * b` is literally the same shape of constraint as the `sym_1 = x * x` example in R1CS/QAP walkthroughs, just expressed in Circom's syntax instead of raw vectors.
- **`MiMCSponge` instead of SHA-256.** Standard hash functions like SHA-256 are expensive to express as arithmetic circuits (their bitwise operations don't map cleanly onto field arithmetic). SNARK-friendly hash functions like MiMC, Poseidon, or Pedersen hashes are designed specifically to minimize the number of multiplication gates, which directly controls proving time.
- **`component main {public [public_hash]}`** declares which signals are public inputs (visible to the verifier) versus private witness signals (`a`, `b` — never transmitted).

### Compiling the circuit

```bash
# Compile the Circom circuit into R1CS, WASM witness generator, and symbol files
circom secret_factorization.circom --r1cs --wasm --sym -o build/

# Inspect the compiled circuit's constraint count
snarkjs r1cs info build/secret_factorization.r1cs
```

The constraint count reported here is the practical cost metric that matters — it drives both proving time and (for Groth16) the size of the trusted setup ceremony.

## The Trusted Setup

Groth16 requires a circuit-specific trusted setup. In production this is run as a multi-party computation (MPC) ceremony so that no single participant ever holds the complete "toxic waste" — but the mechanics for a development/test setup look like this:

```bash
# Phase 1: Powers of Tau (universal, reusable across circuits up to a constraint-count bound)
snarkjs powersoftau new bn128 14 pot14_0000.ptau
snarkjs powersoftau contribute pot14_0000.ptau pot14_final.ptau --name="dev contribution"

# Phase 2: circuit-specific setup, derived from the compiled R1CS
snarkjs groth16 setup build/secret_factorization.r1cs pot14_final.ptau circuit_0000.zkey
snarkjs zkey contribute circuit_0000.zkey circuit_final.zkey --name="dev key contribution"

# Export the verification key -- this is the only artifact the verifier needs
snarkjs zkey export verificationkey circuit_final.zkey verification_key.json
```

The verification key is small (a few group elements) and is the only setup artifact a verifier needs to hold. The proving key (`circuit_final.zkey`) can be large — proportional to the circuit's constraint count — and is only needed by whoever generates proofs.

## Proving and Verifying (Node.js with SnarkJS)

Once the circuit is compiled and the trusted setup is executed, the prover generates the proof in JavaScript.

```javascript
const snarkjs = require("snarkjs");

async function run() {
    // Prover's secret inputs -- 'a' and 'b' never leave this process
    const input = { a: 11, b: 7, public_hash: "14685982959658...truncated" };

    // Generate proof against the compiled witness-calculator (wasm) and proving key (zkey)
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
        input,
        "build/secret_factorization_js/secret_factorization.wasm",
        "circuit_final.zkey"
    );

    console.log("Proof generated!");
    console.log("Public signals sent to verifier:", publicSignals);

    // Verification -- the verifier only ever sees `proof` and `publicSignals`, never `a` or `b`
    const vKey = JSON.parse(require("fs").readFileSync("verification_key.json"));
    const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);

    if (res === true) {
        console.log("Verification OK: prover knows the factors, without having revealed them.");
    } else {
        console.log("Invalid proof");
    }
}

run();
```

Notice what crosses the wire in this whole flow: `proof` (a few hundred bytes) and `publicSignals` (just `public_hash`). At no point does `a` or `b` appear outside the prover's own process — the entire zero-knowledge property is enforced by the math the circuit compiled down to, not by any access control on the network layer.

## Security Considerations and Limitations

**1. The Trusted Setup is a real, exploitable risk, not a formality.** In Groth16, if the randomness used to generate the CRS ("toxic waste") is compromised or not fully destroyed, an attacker who holds it can forge proofs for false statements that still pass verification. Production deployments run multi-party ceremonies specifically so that compromising the setup requires colluding with *every* participant, not just one. Universal-setup schemes like PLONK, and transparent schemes like STARKs or Bulletproofs, remove this risk entirely — at the cost of larger proof sizes or longer verification times.

**2. Side-channel attacks target the prover's machine, not the proof itself.** The zero-knowledge property guarantees the *proof* leaks nothing. It says nothing about the *process generating the proof* — if that process's memory access patterns or timing depend on the secret witness, an attacker with access to the prover's hardware (shared cloud infrastructure, a compromised dependency) can potentially recover `a` and `b` through timing or power analysis, entirely outside the cryptographic protocol.

**3. Under-constrained circuits are the most common real-world SNARK vulnerability.** If a circuit fails to fully constrain a variable — for example, forgetting to force a signal that should be boolean (0 or 1) to actually be one of those two values — an attacker can supply a witness value outside the intended range that still satisfies the R1CS, producing a "valid" proof for a statement the circuit author never intended to allow. This class of bug is why circuit auditing (checking that every signal is genuinely bound by the constraints the author believes it is) is treated as security-critical, equivalent in severity to a smart-contract audit, not just a code-quality pass.

```text
Vulnerable pattern:
  signal input flag;
  // MISSING: flag * (flag - 1) === 0;   <-- forces flag to be exactly 0 or 1
  total <== flag * amount;               // attacker can set flag=7, inflating `total`
                                          // while still satisfying every other constraint
```

## Key Takeaways

- **Circom expresses the same R1CS constraints the underlying theory describes** — every `<==` line is one row in the constraint matrices, just written in a higher-level syntax.
- **SNARK-friendly hash functions (MiMC, Poseidon) exist because general-purpose hashes like SHA-256 are expensive inside an arithmetic circuit** — this is a real, practical constraint that shapes circuit design decisions.
- **The trusted setup's proving key can be discarded by the prover after key generation, but the verification key must be distributed to every verifier** — and compromised setup randomness lets an attacker forge proofs undetectably.
- **Only `proof` and `publicSignals` ever leave the prover's process** — the entire zero-knowledge guarantee rests on the circuit's constraints, not on network-layer access control.
- **Under-constrained signals are the SNARK equivalent of a smart-contract reentrancy bug** — a circuit that "compiles and runs" is not the same as a circuit that has been audited for missing constraints.
