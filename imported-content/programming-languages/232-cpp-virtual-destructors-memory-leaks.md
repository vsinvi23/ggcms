# C++ Inheritance: The Critical Need for Virtual Destructors to Prevent Leaks

Dynamic polymorphism is one of C++'s most powerful object-oriented features. It allows a developer to manipulate objects of various derived types through a single base-class pointer. However, this flexibility introduces a dangerous memory-management trap: if a base-class pointer is deleted while the base class lacks a `virtual` destructor, the program will suffer from undefined behavior, typically manifesting as massive, silent memory leaks.

Understanding how C++ uses the Virtual Table (vtable) to dispatch destructors and why omitting the `virtual` keyword causes resource leaks is essential for writing robust C++ systems.

---

## The Problem: Partial Destruction of Polymorphic Objects

Consider a base class `Base` and a derived class `Derived`. If `Derived` allocates dynamic memory (e.g., a raw pointer or handles a system resource like a file or socket), those resources must be freed in the `Derived` destructor.

If we delete a dynamic instance of `Derived` through a pointer to `Base`, C++ must decide which destructor to execute:

```cpp
Base* ptr = new Derived();
delete ptr; // Which destructor runs?
```

If the `Base` destructor is not declared with the `virtual` keyword, the compiler resolves the destructor call statically at compile time based on the pointer's type (`Base*`). Consequently, only the `Base` destructor executes. The `Derived` destructor is completely bypassed, and any allocations made specifically within the `Derived` class are leaked.

---

## The Mental Model: Vtable and the Destructor Dispatch Chain

To understand how the `virtual` keyword fixes this issue, we must look at the runtime representation of virtual functions: the **Virtual Table (vtable)** and the **Virtual Pointer (vptr)**.

When a class defines any virtual function (including a virtual destructor), the compiler adds a hidden pointer (`vptr`) to the object's layout. This `vptr` references a table of function pointers (`vtable`) representing the class's virtual methods.

### Scenario A: Non-Virtual Destructor (The Leak)
Without `virtual`, there is no destructor entry in the `vtable`. The compiler dispatches directly to the base-class destructor.

```
Base* ptr ────► [ Derived Object Memory Block ]
                ├── base_member_1
                └── derived_member_allocated  <-- LEAKED! (Derived Destructor never runs)
```

### Scenario B: Virtual Destructor (The Cure)
When the `Base` destructor is declared `virtual`, the compiler puts a destructor pointer in the `vtable`. When `delete ptr;` is called, the runtime uses the object's `vptr` to resolve the destructor dynamically, starting from the most derived class.

```
Base* ptr ──► [ Object Block ]
                ├── vptr ───────► [ Derived vtable ]
                │                   └── ~Destructor() ──► Calls ~Derived() first
                ├── base_members                           then automatically
                └── derived_members                        calls ~Base()
```

The destructor call chain always executes in reverse order of construction:
1. `~Derived()` executes, releasing derived-class resources.
2. `~Base()` executes automatically after `~Derived()` completes, clearing base-class resources.

---

## Code Implementation: Demonstrating the Resource Leak

The following complete C++ program demonstrates the catastrophic leak that occurs when a virtual destructor is omitted, and how adding it resolves the issue.

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

Running the program above results in the following output:
```
--- Creating Polymorphic Object ---
Base Constructed
Derived Constructed

--- Deleting Polymorphic Object ---
Base Destructed (Static Dispatch)
```

Notice that `Derived Destructed` is never printed! The 100-integer array allocated on the heap inside `Derived` is leaked. Changing the destructor in the base class to `virtual ~Base()` ensures both destructors are executed in the correct sequence.

---

## Engineering Guidelines

To avoid dynamic memory leaks in object-oriented C++ designs, adhere to these two rules:
1. **Always declare a virtual destructor** in any base class that defines at least one virtual function.
2. If a class is **not** intended to serve as a base class, declare it as `final` to prevent inheritance and avoid paying the `vtable` pointer overhead.
