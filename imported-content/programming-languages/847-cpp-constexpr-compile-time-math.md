# C++ constexpr: Executing Complex Mathematical Calculations at Compile Time

## The Problem: Runtime Math Initialization Latency
A real-time signal processing engine or high-frequency trading application must pre-compute complex trigonometric tables, filter coefficients, or matrix transformation constants on startup. Traditionally, this mathematical table initialization is calculated during application boot, which increases startup times.

Alternatively, developers might use hard-coded, pre-calculated constants:
```cpp
const double SineLookupTable[360] = { 0.0, 0.017452, 0.034899, ... };
```
This hard-coded approach is error-prone and difficult to maintain. If the lookup precision needs to be adjusted, developers must manually regenerate the arrays using external Python or MATLAB scripts, breaking the software development lifecycle.

The goal is to maintain clean, mathematically defined lookup functions in C++ while forcing the compiler to evaluate them at compile time, outputting the pre-calculated tables directly into the compiled binary's `.rodata` segment.

---

## Technical Architecture: Compile-time VM Resolution

```
                             C++ COMPILE-TIME EVALUATION
+-------------------------+       +------------------------+       +------------------------+
|  C++ constexpr Source   | ----> |  Compiler VM Engine    | ----> |  Target Binary Output  |
|  - Pure functions       |       |  - Statically tracks   |       |  - Pre-computed arrays |
|  - Statically bounded   |       |    allocations         |       |  - Read-Only (.rodata) |
+-------------------------+       +------------------------+       +------------------------+
```

To run calculations at compile time, C++ introduces `constexpr` (C++11/14/17) and `consteval` (C++20).

### 1. `constexpr` vs. `consteval`
* **`constexpr`:** Indicates that a function *can* be evaluated at compile time if all input parameters are constant expressions and the return value is bound to a compile-time constant. If called with runtime variables, it compiles as a normal runtime function.
* **`consteval` (C++20):** Represents an **immediate function**. It *must* be evaluated at compile time; if the compiler cannot resolve it statically, compilation halts with a hard error.

### 2. Execution Constraints in the Compiler VM
When executing compile-time code, the compiler runs a virtual machine that interprets C++ statements statically. This VM imposes strict constraints:
* **No Undefined Behavior:** Any attempt to perform out-of-bounds array indexing, dereference null pointers, or overflow integers halts compilation immediately.
* **Bounded Allocations:** Since C++20, `constexpr` functions can perform dynamic memory allocations (such as using `std::vector`), provided that the allocated memory is completely deallocated before the compile-time execution scope terminates.
* **No Non-Literal Types:** You cannot access runtime OS state, network resources, or standard input/output streams (`std::cout`) during compile-time evaluation.

---

## Code Implementation: Compile-Time Taylor-Series Trigonometry
The following C++20 program uses Taylor Series approximations to calculate high-precision sine and cosine lookup tables at compile time, using static assertions to verify correctness prior to binary compilation.

```cpp
#include <iostream>
#include <array>
#include <cmath>
#include <concepts>

namespace Serenya {

    // Statically-checked mathematical constants
    constexpr double PI = 3.14159265358979323846;

    // Compile-time factorial calculation (bounded recursion)
    constexpr double factorial(int n) {
        double result = 1.0;
        for (int i = 1; i <= n; ++i) {
            result *= i;
        }
        return result;
    }

    // Compile-time power calculation
    constexpr double pow(double base, int exp) {
        double result = 1.0;
        if (exp < 0) {
            base = 1.0 / base;
            exp = -exp;
        }
        for (int i = 0; i < exp; ++i) {
            result *= base;
        }
        return result;
    }

    // Statically evaluates sine using Taylor Series approximation:
    // sin(x) = x - x^3/3! + x^5/5! - x^7/7! + ...
    constexpr double compute_sine(double radians) {
        // Normalize radians to [-PI, PI] to ensure Taylor convergence
        double r = radians;
        while (r > PI) r -= 2.0 * PI;
        while (r < -PI) r += 2.0 * PI;

        double sum = 0.0;
        // Run 10 iterations for double-precision convergence
        for (int i = 0; i < 10; ++i) {
            int exponent = 2 * i + 1;
            double term = pow(r, exponent) / factorial(exponent);
            if (i % 2 == 1) {
                sum -= term;
            } else {
                sum += term;
            }
        }
        return sum;
    }

    // Statically generates a lookup table
    template <std::size_t N>
    struct LookupTable {
        std::array<double, N> data{};

        // Constructor runs compile-time generation loop
        constexpr LookupTable() {
            for (std::size_t i = 0; i < N; ++i) {
                double degrees = static_cast<double>(i) * (360.0 / static_cast<double>(N));
                double radians = degrees * (PI / 180.0);
                data[i] = compute_sine(radians);
            }
        }
    };

    // Instantiate lookup table at compile time.
    // This table is written directly to the read-only data (.rodata) segment.
    constexpr auto SineTable = LookupTable<360>();
}

int main() {
    // 1. Programmatically verify table accuracy at compile time using static_assert
    // These checks run BEFORE the compiler produces any assembly code.
    static_assert(Serenya::compute_sine(0.0) == 0.0, "Sine evaluation error at 0.0");
    
    // Check approximation at 90 degrees (sin(90) = 1.0) with epsilon tolerance
    constexpr double sin90 = Serenya::SineTable.data[90];
    static_assert(sin90 > 0.99999 && sin90 < 1.00001, "Trigonometric resolution error at 90 degrees");

    std::cout << "=== Compile-Time Math Generation Verified ===\n";
    std::cout << "Resolved sin(30) from compiled array: " << Serenya::SineTable.data[30] << "\n";
    std::cout << "Resolved sin(90) from compiled array: " << Serenya::SineTable.data[90] << "\n";

    return 0;
}
```

---

## Solving the Problem: Compile-Time Optimization Rules

### Rule 1: Use `consteval` to Prevent Silent Runtime Falls
If a function **must** be executed at compile time, define it using `consteval` rather than `constexpr`. This forces compile-time evaluation:
```cpp
consteval double get_constant_coefficient() {
    return 42.157;
}
```
If you call a `constexpr` function with runtime parameters or bind its output to a non-const variable, the compiler may quietly fall back to runtime execution without warning.

### Rule 2: Limit Recursion Depth and Loop Bounds
To prevent compile-time calculations from stalling the compiler, compilers impose limits on loop iterations and recursion depth inside `constexpr` functions. For complex calculations, split your algorithms into logical, smaller functions to avoid compiler timeouts.

### Rule 3: Use Static Assertions to Enforce Invariants
Compile-time execution provides a major advantage: it allows you to run unit tests and enforce invariants during compilation rather than at runtime. Always place `static_assert` statements adjacent to your compiled datasets to verify mathematical boundaries before compiling your production binaries.
