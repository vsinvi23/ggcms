# C++ constexpr: Executing Logic at Compile Time

## The Problem: The Runtime Tax of Constants
In performance-critical C++ applications (game engines, high-frequency trading, embedded systems), every CPU cycle counts. A common source of wasted cycles is computing values at runtime that could theoretically be known beforehand.

Consider a physics engine that frequently calculates the sine of specific, hardcoded angles, or a program that generates a lookup table of prime numbers on startup. If the inputs to these functions are known when you compile the code, why should the user's CPU spend time calculating them every time the program runs?

Historically, C and C++ developers used preprocessor macros (`#define`) or template metaprogramming to force the compiler to calculate values. However, macros are untyped and dangerous, and template metaprogramming is notoriously complex, resulting in unreadable code and horrifying error messages.

## The Mental Model: Shifting Computation Left
C++11 introduced a cleaner, more intuitive solution: `constexpr` (constant expression). 

The mental model is simple: **Shift computation from runtime to compile time.**

If a function is marked as `constexpr`, and you pass it inputs that are known at compile time, the compiler will execute the function *itself* while building your binary. It will then replace the function call in your code with the hardcoded result. The compiled binary contains only the final answer; the calculation code never runs on the user's machine.

```text
[ Developer writes: int x = factorial(5); ]
                      |
                      v
[ Compiler executes factorial(5) internally ]
                      |
                      v
[ Binary contains:  mov eax, 120            ]
```

## `const` vs. `constexpr`
It's vital to distinguish between `const` and `constexpr`.

*   `const` means: *"This value will not change after it is initialized."* It guarantees immutability, but the initialization might still happen at runtime (e.g., `const int time = time(NULL);`).
*   `constexpr` means: *"This value is known at compile time."* It is a much stronger guarantee. All `constexpr` variables are `const`, but not all `const` variables are `constexpr`.

## Writing `constexpr` Functions
A `constexpr` function can be evaluated at compile time, but it behaves like a normal function if passed runtime variables. This dual nature is incredibly powerful: you write the logic once, and it works everywhere.

```cpp
// A simple constexpr function
constexpr int fibonacci(int n) {
    if (n <= 1) return 1;
    return n * fibonacci(n - 1);
}

int main() {
    // Evaluated at COMPILE TIME. 
    // The binary will just contain the value '120'.
    constexpr int val1 = fibonacci(5); 

    int runtime_input;
    std::cin >> runtime_input;

    // Evaluated at RUNTIME. 
    // The compiler emits machine code to calculate this.
    int val2 = fibonacci(runtime_input); 
}
```

In C++11, `constexpr` functions were highly restricted (e.g., they could only contain a single `return` statement). C++14 relaxed these rules drastically, allowing local variables, `if` statements, and `for` loops. Modern C++ (C++20/C++23) allows almost anything inside `constexpr`, including dynamic memory allocation (std::vector, std::string), provided the memory is freed before the compile-time evaluation finishes.

## Forcing Compile-Time Evaluation with `consteval`
One quirk of `constexpr` is that it is merely a *suggestion* to the compiler. If a `constexpr` function is called with compile-time constants but assigned to a non-constexpr variable, the compiler might still choose to execute it at runtime.

To enforce compile-time execution, C++20 introduced `consteval`. A function marked `consteval` is an **immediate function**. It *must* be evaluated at compile time. If it cannot be evaluated at compile time (e.g., you pass it a user input), the program refuses to compile.

```cpp
consteval int square(int n) {
    return n * n;
}

int main() {
    int a = square(5); // OK: Evaluated at compile time.
    
    int x = 10;
    // int b = square(x); // ERROR: 'x' is not a compile-time constant.
}
```

## Summary
The introduction of `constexpr` and `consteval` revolutionizes performance optimization in C++. By allowing standard, readable C++ functions to be executed by the compiler, developers can drastically reduce application startup times and runtime CPU overhead. It allows the generation of complex lookup tables, configuration parsing, and mathematical calculations to be completely shifted left—turning what used to require black-magic template metaprogramming into straightforward, idiomatic code.
