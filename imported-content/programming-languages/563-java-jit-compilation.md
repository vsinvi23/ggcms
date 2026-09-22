# Deep Dive into JIT Compilation: Tiered Compilation, HotSpot, and Native Optimization

At startup, Java runs slower than pre-compiled native languages like C++. Yet, after running for several minutes, high-throughput Java server applications can reach, and sometimes exceed, compiled execution speeds. This magic is driven by the Just-In-Time (JIT) compiler of the HotSpot JVM.

---

## The Problem: Compilation Overhead vs Runtime Performance

Compiling code to highly optimized native instructions takes time. A static compiler (AOT - Ahead of Time) performs this analysis prior to runtime. However, an AOT compiler cannot predict runtime behavior. It must optimize defensively, accommodating all logical paths even if they are never taken.

An interpreter starts executing instantly but incurs heavy interpretive overhead. 

The HotSpot JIT compiler solves this by dynamically compiling the code *while the application is running*. By profiling the active application, the JIT makes highly aggressive optimizations based on real, live execution profiles—an advantage static compilers lack.

---

## Tiered Compilation Architecture

Modern HotSpot JVMs use **Tiered Compilation** (controlled by the flag `-XX:+TieredCompilation`). Rather than choosing between interpretation and compilation, the JVM divides execution into 5 logical tiers:

```
                  ┌──────────────────────────────┐
                  │     Level 0: Interpreter     │
                  └──────────────┬───────────────┘
                                 │
                        [ High Invocation ]
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │    Level 1: C1 (No Profile)  │
                  └──────────────┬───────────────┘
                                 │
                                 ├────────────────────────┐
                                 ▼                        ▼
                  ┌──────────────────────────────┐ ┌───────────────┐
                  │    Level 2: C1 (Basic Prof)  │ │ Level 3: C1   │
                  └──────────────┬───────────────┘ │ (Full Profile)│
                                 │                 └──────┬────────┘
                                 └───────────┬────────────┘
                                             │
                                     [ Hot Methods ]
                                             │
                                             ▼
                  ┌──────────────────────────────┐
                  │   Level 4: C2 (Heavy Opt)    │
                  └──────────────┬───────────────┘
                                 │
                     [ Un-optimized Trap / Bailout ]
                                 │
                                 ▼
                  ┌──────────────────────────────┐
                  │    Back to Level 0 / 3       │
                  └──────────────────────────────┘
```

* **Level 0 (Interpreter):** Bytecode execution with no JIT compilation. It collects execution profiles (invocation and branch execution counts).
* **Level 1 (Simple C1 JIT):** Compiles bytecode directly to native code without profiling info. Used for simple methods or when C2 is overwhelmed.
* **Level 2 (Limited C1 JIT):** Compiles code with basic profiling (counters).
* **Level 3 (Full C1 JIT):** Compiles with full profiling (branches, types, null checks).
* **Level 4 (C2 JIT / Server Compiler):** Ingests profiling data from Level 3 and performs highly complex global optimizations to generate near-perfect native assembly.

---

## Advanced JIT Optimization Techniques

The JIT uses several advanced compiler optimizations to strip away runtime overhead:

### 1. Method Inlining
Method calls require pushing frames onto thread stacks, setting up registers, and jumping program pointers. The JIT eliminates this overhead by replacing a method call with the actual body of the target method.

```java
// Before Inlining
public int addAndDouble(int a, int b) {
    return multiplyByTwo(add(a, b));
}
private int add(int x, int y) { return x + y; }
private int multiplyByTwo(int z) { return z * 2; }

// After JIT Inlining
public int addAndDouble(int a, int b) {
    return (a + b) * 2;
}
```

### 2. Escape Analysis and Scalar Replacement
Escape Analysis determines if an object allocated inside a method escapes outside its scope (e.g., returned from the method or stored in a global field). 

If an object does not escape, the C2 compiler performs **Scalar Replacement**: it avoids allocating the object on the heap entirely. Instead, it decomposes the object into its scalar primitives and maps them directly to CPU registers or stack slots.

```java
public int process() {
    // Point does not escape
    Point p = new Point(10, 20); 
    return p.x + p.y;
}
```

The JIT compiles this conceptually to:
```java
public int process() {
    int px = 10;
    int py = 20;
    return px + py; // Map directly to registers, 0 heap allocation!
}
```

### 3. Speculative Optimization and Deoptimization
The C2 compiler is highly optimistic. For example, if profiling shows that a certain interface implementation has only been of class `TypeA` for the last 10 minutes, C2 compiles native assembly containing a direct call to `TypeA.method()`, avoiding virtual method table lookups.

However, if a new class `TypeB` is suddenly loaded and passed to the method, this optimization becomes invalid. The JVM hits a **Safepoint**, executes a **Deoptimization**, invalidates the compiled C2 code, bails out back to interpreted mode, and restarts profiling.

```java
// Speculative generated assembly path
if (obj.getClass() != TypeA.class) {
    uncommon_trap(); // Triggers deoptimization back to interpreter
}
obj.directMethod(); // No dynamic dispatch overhead
```
