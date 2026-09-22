# Copy Constructor vs. Move Constructor: Deep Copies vs. Pointer Reassignment

When designing resource-managing classes in C++, developers must carefully declare how objects are created and transferred. This is governed by two key constructor types: the **Copy Constructor** and the **Move Constructor**. Failing to implement these correctly leads to silent memory corruption, double-free bugs, or massive performance degradations.

---

## The Problem: The Peril of Implicit Member Copies

If you do not write them, the compiler synthesizes default copy/move operations for your class. This default copy executes a member-wise **shallow copy**. If your class manages a raw resource pointer, shallow copying results in two objects pointing to the same memory segment:

```cpp
class BadBuffer {
    int* data;
public:
    BadBuffer() : data(new int[100]) {}
    ~BadBuffer() { delete[] data; }
};

void run() {
    BadBuffer b1;
    BadBuffer b2 = b1; // Compiler shallow-copies raw pointer 'data' from b1 to b2!
} // Scope ends: both b1 and b2 destructors call delete[] on the SAME pointer. CRASH!
```

To prevent this, you must explicitly define how copying (Deep Copying) and moving (Pointer Reassignment) are executed.

---

## Anatomy Comparison

Let's inspect the distinct signatures and responsibilities of both constructors:

### 1. The Copy Constructor
```cpp
MyClass(const MyClass& other);
```
- **Signature**: Accepts a `const` reference to an existing lvalue.
- **Duty**: Allocates a brand-new heap resource and copies the original data bytes into it. The source object remains completely unchanged.

### 2. The Move Constructor
```cpp
MyClass(MyClass&& other) noexcept;
```
- **Signature**: Accepts a non-const rvalue reference (`&&`).
- **Duty**: Reassigns the target object's pointers directly to the source object's memory. It then nulls out the source's pointers to prevent destruction issues. The source is mutated into an empty state.

---

## Memory Transition Visualization

```
DEEP COPY (Copy Constructor):
1. Initial State:
   [ b1 (0x1000) ] -------> [ Heap Buffer A (1, 2, 3) ]
   [ b2 (uninitialized) ]

2. After Deep Copy:
   [ b1 (0x1000) ] -------> [ Heap Buffer A (1, 2, 3) ]
   [ b2 (0x2000) ] -------> [ Heap Buffer B (1, 2, 3) ]  (Allocated new buffer and copied contents)


POINTER REASSIGNMENT (Move Constructor):
1. Initial State:
   [ b1 (0x1000) ] -------> [ Heap Buffer A (1, 2, 3) ]
   [ b2 (uninitialized) ]

2. After Move Pointer Theft:
   [ b1 (nullptr) ]         (Nullified to prevent delete during destruction)
   [ b2 (0x1000) ] -------> [ Heap Buffer A (1, 2, 3) ]  (Directly points to existing buffer!)
```

---

## The Copy-and-Swap Idiom

To write robust, exception-safe assignment operators (both copy and move assignment), the industry standard is the **Copy-and-Swap Idiom**. By utilizing a non-member swap function, you can write a single, perfectly exception-safe assignment operator that manages both copy and move allocations automatically:

```cpp
// Exception-safe copy/move assignment using pass-by-value-and-swap
MyClass& operator=(MyClass other) noexcept {
    this->swap(other); 
    return *this;
} // 'other' goes out of scope, releasing the old resource cleanly
```

---

## Code Blueprint: A Complete Production-Ready String Wrapper

The following example implements a custom, highly robust `String` class that explicitly handles deep copies, pointer moves, and exception-safe assignments.

```cpp
#include <iostream>
#include <cstring>
#include <utility>

class String {
public:
    // Standard Constructor
    explicit String(const char* data = "") {
        m_size = std::strlen(data);
        m_buffer = new char[m_size + 1];
        std::strcpy(m_buffer, data);
        std::cout << "[Constructed] '" << m_buffer << "' at address " << (void*)m_buffer << "\n";
    }

    // Destructor
    ~String() {
        if (m_buffer) {
            std::cout << "[Destroyed] '" << m_buffer << "' freed from " << (void*)m_buffer << "\n";
            delete[] m_buffer;
        } else {
            std::cout << "[Destroyed] Empty shell freed.\n";
        }
    }

    // 1. Copy Constructor (Deep Copy)
    String(const String& other) : m_size(other.m_size) {
        m_buffer = new char[m_size + 1];
        std::strcpy(m_buffer, other.m_buffer);
        std::cout << "[Copy Constructed] Deep copied '" << m_buffer << "' to address " << (void*)m_buffer << "\n";
    }

    // 2. Move Constructor (Pointer Reassignment)
    String(String&& other) noexcept : m_buffer(other.m_buffer), m_size(other.m_size) {
        std::cout << "[Move Constructed] Stole pointer from '" << m_buffer << "' at address " << (void*)m_buffer << "\n";
        
        // Nullify other to protect stolen memory from destructor
        other.m_buffer = nullptr;
        other.m_size = 0;
    }

    // Non-member friendly swap helper
    void swap(String& other) noexcept {
        using std::swap;
        swap(m_buffer, other.m_buffer);
        swap(m_size, other.m_size);
    }

    // 3. Exception-Safe Unified Assignment Operator (Copy-and-Swap)
    // Takes argument by value (creates a copy or moves automatically)
    String& operator=(String other) noexcept {
        std::cout << "[Assignment Operator] Swapping contents.\n";
        this->swap(other);
        return *this;
    } // Temporary 'other' goes out of scope and frees the old heap buffer automatically!

    const char* c_str() const { return m_buffer ? m_buffer : ""; }
    size_t size() const { return m_size; }

private:
    char* m_buffer = nullptr;
    size_t m_size = 0;
};

int main() {
    std::cout << "--- 1. Constructing Strings ---\n";
    String s1{"Modern C++"};

    std::cout << "\n--- 2. Triggering Deep Copy ---\n";
    String s2{s1}; // Deep Copy Constructor

    std::cout << "\n--- 3. Triggering Move ---\n";
    String s3{std::move(s1)}; // Move Constructor (s1 is now empty)

    std::cout << "\n--- 4. Triggering Copy-and-Swap Assignment ---\n";
    String s4{"Legacy Code"};
    s4 = s2; // Deep copy initialized, then swapped

    std::cout << "\n--- 5. Verifying State ---\n";
    std::cout << "s1 state: '" << s1.c_str() << "' (size: " << s1.size() << ")\n";
    std::cout << "s3 state: '" << s3.c_str() << "' (size: " << s3.size() << ")\n";
    std::cout << "s4 state: '" << s4.c_str() << "' (size: " << s4.size() << ")\n";

    std::cout << "\n--- 6. Exiting Main Scope ---\n";
    return 0;
}
```

---

## Architectural Guidelines for Constructor Design

- **Make moves `noexcept`**: Move operations must never throw exceptions because dynamic reallocations of arrays or vector resizing require move guarantees to ensure transactional rollback safety.
- **Adhere to the Rule of 5**: If you declare a custom copy or move constructor, you must also define the destructors and assignment operators to ensure class invariants remain intact.
- **Check for self-assignment (if not using Copy-and-Swap)**: If you implement custom assignments manually without copy-and-swap, always perform a self-assignment check (`if (this == &other) return *this;`) to prevent deleting your own memory before copying it.

---

## Key Takeaways

1. **Copy Allocates, Move Reassigns**: Copy constructors create duplicates by allocating fresh heap memory. Move constructors steal raw pointers and nullify the original sources.
2. **Copy-and-Swap Safety**: Using the Copy-and-Swap idiom produces exceptionally clean, exception-safe code with zero duplicated logic.
3. **Move Is Fast**: Move operations are $O(1)$ constant-time pointer swaps. Deep copies are $O(N)$ linear-time byte-copy operations.
4. **Protect Moved-From State**: Always set the moved-from object’s resource pointers to `nullptr` to prevent destructors from corrupting active allocations.
