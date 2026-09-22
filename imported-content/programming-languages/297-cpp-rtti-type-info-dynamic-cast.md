# C++ RTTI: The Internal `type_info` Struct and Why `dynamic_cast` Degrades Performance

## The Problem: Polymorphism at Runtime

In object-oriented C++, polymorphism allows a pointer to a base class to invoke methods on a derived class via virtual functions. For example, a `Shape*` might point to a `Circle` or a `Square`. 

Most of the time, virtual function resolution is highly optimized via the virtual table (`vtable`), introducing negligible overhead. However, there are scenarios where the developer needs to know the *exact* derived type at runtime. Perhaps you need to downcast a `Shape*` back into a `Circle*` to access a method that only `Circle` possesses. 

To safely perform this downcast, C++ provides `dynamic_cast`. If the object is indeed a `Circle`, the cast succeeds; if it is a `Square`, it returns a `nullptr`. But how does the program actually figure out what type the object is at runtime? C++ tracks this using **Run-Time Type Information (RTTI)**. While RTTI enables safe downcasting, it introduces severe architectural and performance penalties that cause many game engines and high-performance systems to disable it entirely (`-fno-rtti`).

## The Mental Model: The Vtable and `type_info`

When a C++ class contains at least one virtual function, the compiler automatically generates a hidden `vtable` for that class. Every instance of the class carries a hidden pointer (the `vptr`) pointing to this table. 

If RTTI is enabled, the compiler embeds an extra piece of metadata into the `vtable`—a pointer to a `std::type_info` object. This `type_info` struct contains the mangled string name of the class and hierarchy data.

When you execute `dynamic_cast<Derived*>(base_ptr)`, the compiler doesn't just do a simple memory offset. It must perform an active investigation:
1. Dereference `base_ptr` to find the `vptr`.
2. Dereference the `vptr` to find the `vtable`.
3. Locate the `type_info` pointer within the `vtable`.
4. Traverse the inheritance graph data within `type_info` to check if `Derived` is anywhere in the inheritance chain.

## Visualizing the RTTI Graph Traverse

```text
[ Object Instance (base_ptr) ]
  |-- int x;
  |-- vptr ------------------------> [ Shape vtable ]
                                       |-- type_info* -----> [ std::type_info: "Shape" ]
                                       |                     (Contains Graph: Parent = None)
                                       |
                                       |-- ~Shape()
                                       |-- draw()

[ If Object is actually a Circle ]
  |-- vptr ------------------------> [ Circle vtable ]
                                       |-- type_info* -----> [ std::type_info: "Circle" ]
                                       |                     (Contains Graph: Parent = Shape)
```

## Deep Dive & Code: typeid and dynamic_cast

Let's observe RTTI in action using the `typeid` operator (which queries `type_info` directly) and `dynamic_cast`.

```cpp
#include <iostream>
#include <typeinfo>

class Entity {
public:
    // A virtual destructor ensures the generation of a vtable and RTTI data.
    virtual ~Entity() = default; 
};

class Player : public Entity {
public:
    void useHealthPotion() { std::cout << "Healed!\n"; }
};

class Enemy : public Entity {
public:
    void attack() { std::cout << "Attacked!\n"; }
};

void interact(Entity* entity) {
    // Querying RTTI metadata directly
    std::cout << "Interacting with type: " << typeid(*entity).name() << "\n";

    // 🛑 THE PERFORMANCE HIT 🛑
    // The CPU must chase pointers through the vtable, access type_info, 
    // and traverse the inheritance graph to verify this is safe.
    if (Player* p = dynamic_cast<Player*>(entity)) {
        p->useHealthPotion();
    } else {
        std::cout << "Not a player.\n";
    }
}

int main() {
    Player player;
    Enemy enemy;

    interact(&player);
    interact(&enemy);

    return 0;
}
```

## The Performance Degradation

Why is `dynamic_cast` frowned upon in performance-critical code? 

1. **Pointer Chasing and Cache Misses:** The lookup process (Instance -> Vptr -> Vtable -> TypeInfo) guarantees multiple jumps across memory. In modern CPUs, memory latency is the primary bottleneck. If the `vtable` or `type_info` is not in the L1/L2 CPU cache, `dynamic_cast` triggers a devastating cache miss.
2. **String Comparisons / Graph Traversal:** In complex inheritance trees (e.g., Multiple Inheritance or deeply nested classes), checking if `Type A` inherits from `Type B` can involve dynamic tree traversal and even string comparisons of type names.
3. **Binary Bloat:** Embedding `type_info` for every polymorphic class significantly inflates the binary size. 

Because of this, engines like Unreal Engine disable standard RTTI. Instead, they implement "Custom RTTI" using manual enums or integers to identify types. Checking an integer ID (e.g., `if (entity->type == TYPE_PLAYER)`) takes a single CPU cycle, whereas `dynamic_cast` can cost hundreds.

## Conclusion

C++ RTTI and `dynamic_cast` offer a convenient, safe way to navigate object hierarchies at runtime. However, this safety comes at the cost of hidden memory indirections and graph traversals. By understanding the mechanical link between the `vtable` and the internal `type_info` struct, systems programmers can identify when RTTI is bottlenecking hot-path execution and choose faster, manual type-tagging architectures instead.