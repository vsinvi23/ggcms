# C++ Templates from First Principles: Code Generation and Monomorphization

## Problem Statement
In strongly-typed systems, writing generic algorithms traditionally forces a choice between two evils: code duplication (rewriting the same logic for `int`, `float`, `MyStruct`) or type erasure (casting to `void*` or a common base class). The former causes maintenance nightmares; the latter destroys type safety and runtime performance by forcing virtual dispatch or dynamic checks.

## Architectural Solution: Monomorphization
Modern C++ solves this using **templates** and a process called **monomorphization**. When you define a template, you are not writing a function or a class; you are writing a *recipe* for the compiler to generate them. 

During compilation, the compiler inspects every instantiation of a template and stamps out a concrete, type-specific version of that code. This means zero runtime overhead—the generic code runs exactly as fast as manually duplicated specific code.

### Monomorphization Flow

```text
                  +-------------------------+
                  |  Template Definition    |
                  |  template<class T>      |
                  |  T max(T a, T b)        |
                  +-----------+-------------+
                              |
                [Compiler Type Resolution]
                              |
       +----------------------+----------------------+
       |                      |                      |
+------v------+        +------v------+        +------v------+
| max<int>    |        | max<float>  |        | max<MyObj>  |
| (int, int)  |        | (float,...) |        | (MyObj,...) |
+-------------+        +-------------+        +-------------+
       |                      |                      |
[ Machine Code ]       [ Machine Code ]       [ Machine Code ]
```

## Robust Code Example

Here is a minimal demonstration of how templates resolve types and how we can constrain them using C++20 concepts to prevent cryptic compilation errors.

```cpp
#include <iostream>
#include <concepts>

// A concept ensuring the type supports the > operator
template<typename T>
concept Comparable = requires(T a, T b) {
    { a > b } -> std::convertible_to<bool>;
};

// The template definition constrained by the concept
template <Comparable T>
T get_max(T a, T b) {
    return (a > b) ? a : b;
}

struct Point {
    int x, y;
    // Overloading > to satisfy the Comparable concept
    bool operator>(const Point& other) const {
        return (x * x + y * y) > (other.x * other.x + other.y * other.y);
    }
};

int main() {
    int i = get_max(10, 20);                  // Generates get_max<int>
    double d = get_max(3.14, 2.71);           // Generates get_max<double>
    Point p = get_max(Point{1,2}, Point{3,4});// Generates get_max<Point>
    
    std::cout << "Max int: " << i << "\n";
    return 0;
}
```

## Under the Hood: Mechanics and Trade-offs

1. **Two-Phase Name Lookup:** When parsing a template, the compiler does a first pass for non-dependent names (syntax checking). Later, upon instantiation, it performs a second pass for dependent names (verifying that `a > b` actually exists for `T`).
2. **Name Mangling:** Because C++ lacks function overloading purely by return type and needs linker-level uniqueness, templates generate highly complex mangled symbols. `get_max<int>` might become `_Z7get_maxIiET_S0_S0_`.
3. **Code Bloat (The Trade-off):** Monomorphization generates identical logic for every distinct type. If a binary instantiates `std::vector<T>` for 50 different structs, it generates 50 distinct binary implementations of `push_back`. Smart compilers combat this through ICF (Identical Code Folding), merging binary-identical functions at link time if they share the same machine code (e.g., `vector<int*>` and `vector<void*>`).