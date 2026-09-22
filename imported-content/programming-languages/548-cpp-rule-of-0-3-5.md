# Rule of 0, 3, and 5 Explained: Class Design for Resource Management

C++ classes are highly customizable. When writing a class, the compiler can synthesize up to five special member functions to manage the lifecycle of your object: the destructor, the copy constructor, the copy assignment operator, the move constructor, and the move assignment operator. Navigating when to implement, default, or delete these functions is governed by three historical design standards: the **Rule of Three**, the **Rule of Five**, and the **Rule of Zero**.

---

## The Problem: Silently Broken Compiler Synthesis

If you design a class that manages dynamic allocations, file handlers, or network channels, the compiler's default behavior is often dangerous. For example:

```cpp
class NetworkSocket {
    int m_socketFd;
public:
    NetworkSocket() : m_socketFd(openSocket()) {}
    ~NetworkSocket() { close(m_socketFd); } // Releases raw system resource
};
```

If you copy this class (`NetworkSocket s2 = s1;`), the compiler synthesizes a default copy constructor that simply copies the value of `m_socketFd` to `s2`. 

When `s2` goes out of scope, its destructor runs, closing the system socket. Now `s1` holds a dead, dangling socket handle. When `s1` goes out of scope, it attempts to close the socket a second time, resulting in severe operating system resource corruption.

---

## The Lifetime Rules Decoded

```
                      Do you manage raw resource pointers?
                                   /        \
                                 Yes        No
                                 /            \
               Do you support C++11 moves?   Use Rule of 0:
                      /             \        Let compiler synthesize
                    Yes             No       all 5 operations.
                    /                 \
             Rule of 5:            Rule of 3:
             - Destructor          - Destructor
             - Copy Constructor    - Copy Constructor
             - Copy Assignment     - Copy Assignment
             - Move Constructor
             - Move Assignment
```

### 1. Rule of Three (Legacy C++98)
If a class explicitly defines a **Destructor**, a **Copy Constructor**, or a **Copy Assignment Operator**, it almost certainly needs to define **all three**. This is because the existence of any custom cleanup or allocation logic implies that member-wise shallow copying will break your class invariants.

### 2. Rule of Five (Modern C++11)
With the introduction of move semantics, we expand the Rule of Three to the Rule of Five. If you define a custom destructor, copy constructor, or copy assignment operator, you must also define (or delete) the **Move Constructor** and the **Move Assignment Operator**. 

If you define a custom copy operation but omit the move operations, the compiler will silently turn move requests back into expensive copy operations, causing massive performance losses.

### 3. Rule of Zero (Preferred Modern C++)
Classes that do not manage resources directly should **not define any of the five special member functions**. Instead, use standard-library resource managers (like `std::unique_ptr`, `std::shared_ptr`, `std::string`, and `std::vector`). 

The standard-library components already implement the Rule of Five internally. By composing your classes with them, the compiler will automatically synthesize correct copy, move, and destruction semantics for your class with zero boilerplate code.

---

## Code Blueprint: Implementation Comparison

Let's look at how classes are designed under both the Rule of Five and the Rule of Zero.

### Custom Resource Handling (Rule of Five)

Use this style when writing custom low-level wrapper libraries or integrating with C-style APIs:

```cpp
#include <iostream>
#include <utility>

class RawSocketWrapper {
public:
    explicit RawSocketWrapper(int port) : m_handle(new int(port)) {
        std::cout << "[Socket] Opened on port " << *m_handle << "\n";
    }

    // 1. Destructor
    ~RawSocketWrapper() {
        if (m_handle) {
            std::cout << "[Socket] Closing port " << *m_handle << "\n";
            delete m_handle;
        }
    }

    // 2. Copy Constructor
    RawSocketWrapper(const RawSocketWrapper& other) : m_handle(new int(*other.m_handle)) {
        std::cout << "[Socket] Copied connection to port " << *m_handle << "\n";
    }

    // 3. Copy Assignment
    RawSocketWrapper& operator=(const RawSocketWrapper& other) {
        std::cout << "[Socket] Copy assignment.\n";
        if (this != &other) {
            delete m_handle;
            m_handle = new int(*other.m_handle);
        }
        return *this;
    }

    // 4. Move Constructor
    RawSocketWrapper(RawSocketWrapper&& other) noexcept : m_handle(other.m_handle) {
        std::cout << "[Socket] Moving connection to port " << *m_handle << "\n";
        other.m_handle = nullptr; // Nullify source pointer
    }

    // 5. Move Assignment
    RawSocketWrapper& operator=(RawSocketWrapper&& other) noexcept {
        std::cout << "[Socket] Move assignment.\n";
        if (this != &other) {
            delete m_handle;
            m_handle = other.m_handle;
            other.m_handle = nullptr; // Nullify source pointer
        }
        return *this;
    }

private:
    int* m_handle = nullptr;
};
```

---

### Idiomatic Modern C++ (Rule of Zero)

This is the preferred modern style. It achieves the exact same level of safety and resource management as the class above, but with **zero custom boilerplate**:

```cpp
#include <iostream>
#include <memory>
#include <string>
#include <vector>

// Enforcing the Rule of Zero: The compiler automatically synthesizes
// safe, efficient copy, move, and destructor methods.
class ModernServerSession {
public:
    ModernServerSession(std::string name, int port)
        : m_sessionName(std::move(name)),
          m_socketHandle(std::make_unique<int>(port)) {}

    // No custom destructor, copy/move constructors, or assignments needed!
    // The std::unique_ptr prevents copying, automatically making this class Move-Only.
    // If copying is required, use a container that supports copying (like std::vector).

    void start() const {
        std::cout << "Session '" << m_sessionName 
                  << "' listening on socket port " << *m_socketHandle << "\n";
    }

private:
    std::string m_sessionName;
    std::unique_ptr<int> m_socketHandle;
};

int main() {
    std::cout << "--- Rule of 5 Execution ---\n";
    RawSocketWrapper socket1{8080};
    RawSocketWrapper socket2 = std::move(socket1); // Safely moved, no double-close!

    std::cout << "\n--- Rule of 0 Execution ---\n";
    ModernServerSession server1{"ProductionWebServer", 443};
    server1.start();

    // ModernServerSession serverCopy = server1; // Compile error: std::unique_ptr is copy-disabled!
    ModernServerSession server2 = std::move(server1); // Moves safely and cleanly
    server2.start();

    return 0;
}
```

---

## Architectural Guidelines for Special Member Functions

- **Prefer Rule of Zero**: Let standard-library managers handle your lifecycles. It is simpler, safer, and highly readable.
- **Delete unsupported operations explicitly**: If your class manages a resource that should not be copied (like a database transaction or a file write lock), explicitly mark the copy constructor and copy assignment as `delete`:
  ```cpp
  Transaction(const Transaction&) = delete;
  Transaction& operator=(const Transaction&) = delete;
  ```
- **Always declare virtual destructors in polymorphic base classes**: If you have a base class with virtual functions, you must declare a `virtual ~Base() = default;`. Failing to do so causes undefined behavior when deleting derived objects through a base pointer.

---

## Key Takeaways

1. **Rule of 3 (Legacy)**: If you implement a destructor, copy constructor, or copy assignment, implement all three.
2. **Rule of 5 (Modern)**: If you write custom copies or destructors, declare the move constructors and move assignments as well to avoid silent fallback copies.
3. **Rule of 0 (Best Practice)**: Delegate resource ownership to smart pointers and standard-library managers, eliminating the need to write any custom lifecycle boilerplate.
4. **Enforce Intent**: Use `= delete` to block operations (like copying) that your target resource cannot safely support.
