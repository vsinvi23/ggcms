---
title: "C++ RTTI: The Performance Cost of dynamic_cast"
description: "How dynamic_cast traverses the RTTI type hierarchy at runtime, why it's expensive on deep or multiply-inherited class trees, and faster alternatives like type-tagging and clean virtual dispatch."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "cpp"
  - "rtti"
  - "dynamic-cast"
  - "vtable"
  - "performance"
---

# C++ RTTI: The Performance Cost of dynamic_cast

In object-oriented C++, polymorphism lets us write elegant, decoupled code: functions operate on pointers or references to a base class, and the virtual method table (vtable) dispatches execution to the correct derived implementation at runtime.

A common design friction, though, is needing to reconstruct concrete type details from a base pointer — *"is this `Shape*` actually a `Circle*`?"* C++ provides **Run-Time Type Identification (RTTI)** and the `dynamic_cast` operator for exactly this. `dynamic_cast` is safe: it returns `nullptr` for pointers (or throws `std::bad_cast` for references) on an invalid cast. But that safety carries a real, often hidden, performance penalty. In game development, embedded programming, and high-frequency trading, RTTI is frequently disabled entirely (`-fno-rtti`). This article walks through how `dynamic_cast` actually traverses the inheritance tree, and what the faster alternatives look like.

---

## The Mental Model: Vtables, RTTI, and Tree Traversal

To understand the cost of `dynamic_cast`, start with how polymorphic classes represent type information in memory.

When a class defines or inherits at least one virtual function, the compiler generates a **vtable** for it. Every instance carries a hidden pointer (`vptr`) into that vtable. Crucially, the vtable doesn't only hold pointers to virtual methods — it also holds a pointer to a **type metadata block** (a `std::type_info` instance):

```text
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

When you write `dynamic_cast<Derived*>(base_ptr)`, the compiler cannot resolve the check at compile time. At runtime the program must:

1. **Access the `vptr`** of the object pointed to by `base_ptr` to find its concrete vtable.
2. **Retrieve the `std::type_info`** metadata from that vtable.
3. **Traverse the inheritance tree.** With multiple or virtual inheritance, the runtime walks the DAG of base types, matching names and checking offset alignments.
4. **Compare type names or descriptors.** On some implementations (e.g. `libstdc++` on GCC), this can involve string comparisons of mangled class names when type metadata isn't deduplicated across shared-library boundaries.

If the hierarchy is deep or has multiple inheritance paths, this traversal is an $O(N)$ operation over type metadata — a real bottleneck on performance-critical paths.

---

## The Code: Safe but Slow vs. Fast and Targeted

Three common patterns for downcasting: `dynamic_cast` (safe but slow), type-tagging with `static_cast` (fast but manual), and eliminating the downcast entirely via virtual dispatch.

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

// Option 2: Type-Tag + static_cast (Extremely Fast, common in game engines)
void process_with_static_cast(Shape* shape) {
    if (shape->get_type() == TypeTag::Circle) {
        auto* circle = static_cast<Circle*>(shape); // No runtime overhead
        circle->roll();
    }
}
```

### Analysis of the Casts

- **`dynamic_cast`** validates safety at runtime. If the object isn't actually a `Circle`, it returns `nullptr`. Safe, but it pays for the RTTI lookup and tree traversal on every call.
- **`static_cast`** bypasses all runtime checks. The compiler emits a fixed pointer-offset calculation (zero-cost for single inheritance). But if you cast a `Square` to a `Circle` by mistake, that's **undefined behavior** — memory corruption or a crash, with no safety net.

---

## Common Misconceptions

### "RTTI and dynamic_cast are free if you don't use them."

**The reality:** if RTTI is enabled (the default), the compiler generates a `std::type_info` block for *every* class containing a virtual function, whether or not you ever cast it. This bloats binary size and cache footprint even in code paths that never call `dynamic_cast`.

### "All casts are the same."

**The reality:** `static_cast`, `reinterpret_cast`, and `const_cast` are purely compile-time constructs — they generate zero additional runtime instructions (aside from pointer-offset shifts under multiple inheritance). Only `dynamic_cast` generates runtime branch checks and RTTI traversal instructions.

---

## Key Takeaways

- **Avoid frequent downcasting.** If you find yourself downcasting base pointers to derived pointers often, that's a design smell — push the behavior into a virtual function on the base class (e.g. `on_action()`) and let the vtable resolve it naturally.
- **Use type tags for hot paths.** In performance-critical domains (physics, audio, game loops), an `enum class` tag combined with `static_cast` bypasses RTTI entirely.
- **Compile with `-fno-rtti`** on resource-constrained or high-performance targets (`/GR-` on MSVC) to save memory, shrink binaries, and force cleaner polymorphic design.
