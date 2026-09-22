---
title: "Virtual Destructors in C++: Preventing Memory Leaks in Polymorphic Deletes"
description: "Why deleting a derived object through a non-virtual base-class destructor silently skips the derived destructor and leaks memory, and how the vtable fixes it with dynamic destructor dispatch."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "cpp"
  - "virtual-destructors"
  - "memory-leaks"
  - "vtable"
  - "polymorphism"
---

# Virtual Destructors in C++: Preventing Memory Leaks in Polymorphic Deletes

Dynamic polymorphism is one of C++'s most powerful object-oriented features — it lets you manipulate objects of many derived types through a single base-class pointer. But that flexibility hides a dangerous memory-management trap: if a base-class pointer is deleted while the base class lacks a `virtual` destructor, the result is undefined behavior, typically manifesting as massive, silent memory leaks.

Understanding how C++ uses the vtable to dispatch destructors — and why omitting `virtual` causes resource leaks — is essential for writing robust C++ systems.

---

## The Problem: Partial Destruction of Polymorphic Objects

Consider a base class `Base` and a derived class `Derived`. If `Derived` allocates dynamic memory (a raw pointer, a file handle, a socket), that resource must be freed in `Derived`'s destructor.

If we delete a dynamically-allocated `Derived` instance through a `Base*` pointer, C++ has to decide which destructor runs:

```cpp
Base* ptr = new Derived();
delete ptr; // Which destructor runs?
```

If `Base`'s destructor is not declared `virtual`, the compiler resolves the destructor call **statically**, at compile time, based on the pointer's static type (`Base*`). Only `~Base()` executes. `~Derived()` is completely bypassed — and anything `Derived` allocated is leaked.

---

## The Mental Model: Vtable and the Destructor Dispatch Chain

To see how `virtual` fixes this, look at how virtual functions are represented at runtime: the **vtable** and the **vptr**.

When a class defines any virtual function — including a virtual destructor — the compiler adds a hidden pointer (`vptr`) to the object's memory layout. That `vptr` points at a table of function pointers (the `vtable`) representing the class's virtual methods.

### Scenario A: Non-Virtual Destructor (The Leak)

Without `virtual`, there's no destructor entry in the vtable at all. The compiler dispatches directly to the base-class destructor, statically:

```text
Base* ptr ────► [ Derived Object Memory Block ]
                ├── base_member_1
                └── derived_member_allocated  <-- LEAKED! (Derived Destructor never runs)
```

### Scenario B: Virtual Destructor (The Cure)

When `Base`'s destructor is declared `virtual`, the compiler places a destructor pointer in the vtable. When `delete ptr;` runs, the runtime follows the object's `vptr` to resolve the destructor dynamically, starting from the most-derived class:

```text
Base* ptr ──► [ Object Block ]
                ├── vptr ───────► [ Derived vtable ]
                │                   └── ~Destructor() ──► Calls ~Derived() first
                ├── base_members                           then automatically
                └── derived_members                        calls ~Base()
```

The destructor chain always runs in reverse order of construction:

1. `~Derived()` runs first, releasing derived-class resources.
2. `~Base()` runs automatically afterward, clearing base-class resources.

---

## Code Implementation: Demonstrating the Resource Leak

The following complete program shows the leak that occurs when the virtual destructor is omitted.

```cpp
#include <iostream>

class Base {
public:
    Base() { std::cout << "Base Constructed\n"; }

    // Changing this to 'virtual ~Base()' resolves the memory leak
    ~Base() { std::cout << "Base Destructed (Static Dispatch)\n"; }
};

class Derived : public Base {
private:
    int* dynamic_array;
public:
    Derived() {
        std::cout << "Derived Constructed\n";
        dynamic_array = new int[100]; // Allocation in Derived
    }

    ~Derived() {
        std::cout << "Derived Destructed (Dynamic Dispatch)\n";
        delete[] dynamic_array; // Releasing Derived allocation
    }
};

int main() {
    std::cout << "--- Creating Polymorphic Object ---\n";
    Base* polymorphic_ptr = new Derived();

    std::cout << "\n--- Deleting Polymorphic Object ---\n";
    // Bypasses Derived destructor because ~Base() is non-virtual!
    delete polymorphic_ptr;

    return 0;
}
```

### Program Output Analysis

Running this program produces:

```text
--- Creating Polymorphic Object ---
Base Constructed
Derived Constructed

--- Deleting Polymorphic Object ---
Base Destructed (Static Dispatch)
```

Notice `Derived Destructed` is never printed — the 100-integer array allocated inside `Derived` is leaked. Changing the base destructor to `virtual ~Base()` ensures both destructors run, in the correct order.

---

## Engineering Guidelines

1. **Always declare a virtual destructor** in any base class that defines at least one virtual function — that's the signal the class is meant to be used polymorphically through a base pointer.
2. **If a class is not intended to be a base class, mark it `final`.** That documents intent, prevents accidental inheritance, and avoids paying for a `vptr` you don't need.
