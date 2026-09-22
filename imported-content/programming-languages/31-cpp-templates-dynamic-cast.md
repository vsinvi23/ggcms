# C++ RTTI: Run-Time Type Identification and the Performance Cost of dynamic_cast

In object-oriented C++, polymorphism allows us to write elegant, decoupled code. We write functions that operate on pointers or references to base classes, letting the virtual method table (vtable) dispatch execution to the correct derived implementation.

However, a common design friction occurs when we need to reconstruct concrete type details from a base pointer. We might ask, *"Is this `Shape*` actually a `Circle*`?"* To solve this safely, C++ provides **Run-Time Type Identification (RTTI)** and the `dynamic_cast` operator. 

While `dynamic_cast` ensures safety by returning `nullptr` (or throwing a `std::bad_cast` for references) if a cast is invalid, it introduces a significant, often hidden performance penalty. In game development, embedded programming, and high-frequency trading, RTTI is frequently disabled entirely (`-fno-rtti`). This article explores how `dynamic_cast` traverses inheritance trees under the hood and outlines high-performance alternatives.

---

## The Mental Model: Vtables, RTTI, and Tree Traversal

To understand the cost of `dynamic_cast`, we must understand how polymorphic classes represent types in memory.

When a class defines or inherits at least one virtual function, the compiler generates a **Virtual Table (vtable)** for that class. Every instance of the class contains a hidden pointer (the `vptr`) pointing to this vtable. 

Crucially, the vtable does not just store pointers to virtual methods; it also contains a pointer to a **type metadata block** (an instance of `std::type_info`).

```
    [ Derived Instance in Memory ]
    +---------------------------+
    | vptr (Virtual Pointer)    |-----> [ Derived Vtable ]
    +---------------------------+       +-------------------------+
    | Member variables          |       | type_info Pointer (*)   |---> [ std::type_info ]
    +---------------------------+       +-------------------------+     - Name: "Derived"
                                        | Method 1 Pointer (*)    |     - Inheritance hierarchy info
                                        | Method 2 Pointer (*)    |
                                        +-------------------------+
```

When you write `dynamic_cast<Derived*>(base_ptr)`, the compiler cannot resolve this check at compile-time. At run-time, the program must perform the following mechanical steps:

1. **Access the `vptr`** of the object pointed to by `base_ptr` to find its concrete vtable.
2. **Retrieve the `std::type_info`** metadata.
3. **Traverse the inheritance tree.** If the hierarchy involves multiple inheritance or virtual inheritance, the runtime must walk through the DAG (Directed Acyclic Graph) of base types, matching names and checking offset alignments.
4. **Compare type names or descriptors.** In some compiler implementations (like `libstdc++` on GCC), this involves string comparisons of mangled class names if the type metadata is not deduplicated across shared library boundaries.

If the tree is deep or contains multiple inheritance paths, this traversal is an $O(N)$ operation over type metadata, representing a massive bottleneck on performance-critical paths.

---

## The Code: Safe but Slow vs. Fast and Targeted

Let's look at the three common patterns for downcasting: `dynamic_cast` (safe but slow), Type-Tagging with `static_cast` (fast and manual), and Clean Polymorphism (eliminating downcasting).

```cpp
#include <iostream>
#include <vector>
#include <chrono>

enum class TypeTag { Base, Circle, Square };

class Shape {
public:
    virtual ~Shape() = default;
    virtual TypeTag get_type() const { return TypeTag::Base; }
    virtual void draw() const = 0;
};

class Circle : public Shape {
public:
    TypeTag get_type() const override { return TypeTag::Circle; }
    void draw() const override { /* Circle drawing code */ }
    void roll() const { std::cout << "Rolling circle!\n"; }
};

class Square : public Shape {
public:
    TypeTag get_type() const override { return TypeTag::Square; }
    void draw() const override { /* Square drawing code */ }
};

// Option 1: dynamic_cast (Slow)
void process_with_dynamic_cast(Shape* shape) {
    if (auto* circle = dynamic_cast<Circle*>(shape)) {
        circle->roll(); // Safe, but requires RTTI tree traversal
    }
}

// Option 2: Type-Tag + static_cast (Extremely Fast, common in Game Engines)
void process_with_static_cast(Shape* shape) {
    if (shape->get_type() == TypeTag::Circle) {
        auto* circle = static_cast<Circle*>(shape); // No runtime overhead
        circle->roll();
    }
}
```

### Analysis of the Casts
* **`dynamic_cast`:** Validates safety at run-time. If the object is not a `Circle`, it returns `nullptr`. This is safe but requires looking up the RTTI metadata and traversing type trees.
* **`static_cast`:** Bypasses all runtime checks. The compiler emits a simple, fixed pointer offset calculation (often zero-cost if single inheritance). However, if you make a mistake and cast a `Square` to a `Circle`, you invoke **Undefined Behavior (UB)**, leading to memory corruption or crashes.

---

## Common Misconceptions

### 1. "RTTI and dynamic_cast are free if you don't use them."
**The Reality:** If RTTI is enabled in your compiler (the default), the compiler generates a `std::type_info` block for *every* class containing a virtual function, regardless of whether you cast it. This bloats binary sizes and footprint in cache memory.

### 2. "All casts are the same."
**The Reality:** The other C++ casts (`static_cast`, `reinterpret_cast`, and `const_cast`) are purely compile-time constructs. They generate zero additional instructions in the final executable (except for pointer shifts in multiple inheritance). Only `dynamic_cast` generates run-time logical branch checks and RTTI traversal instructions.

---

## Key Takeaways

* **Avoid Downcasting:** If you find yourself frequently downcasting base pointers to derived pointers, re-evaluate your object-oriented design. Shift the specific behavior into a virtual function on the base class (e.g., a virtual `on_action()` method) to let the vtable resolve execution naturally.
* **Use Type Tags for Hot Paths:** In performance-critical domains (like physics, audio rendering, or game loops), use an `enum class` type-tag system combined with `static_cast` to bypass RTTI completely.
* **Compile with `-fno-rtti`:** If you are working on a resource-constrained platform or high-performance library, compile with RTTI disabled (`-fno-rtti` in GCC/Clang, `/GR-` in MSVC). This saves memory, reduces binary size, and forces developers to write cleaner, more idiomatic polymorphic code.
