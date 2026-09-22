# Use-After-Free (UAF) Explained

## The Problem
Use-After-Free (UAF) is a critical memory safety vulnerability. It occurs when a program continues to use a pointer to heap memory after that memory has been deallocated via `free()`. Because the heap allocator often places freed chunks into a "free list" to be reused by future `malloc()` calls, writing to a freed pointer can corrupt allocator metadata or inadvertently modify unrelated data structures that subsequently claimed that memory.

UAF is highly exploitable, frequently leading to arbitrary code execution.

## Technical Architecture

The standard C runtime (libc) manages heap memory. When `free(ptr)` is called, the memory isn't physically erased. Instead, the runtime allocator (e.g., `ptmalloc`, `jemalloc`) updates its internal data structures to mark the chunk as available. 

```text
       Heap State: Timeline
       
T0: ptr1 = malloc(32);
+-----------------------------------+
| [ptr1 Data: "Admin Data......"]   |
+-----------------------------------+

T1: free(ptr1);
+-----------------------------------+
| [Free List Metadata] (Freed)      | <-- ptr1 STILL points here!
+-----------------------------------+

T2: ptr2 = malloc(32); // Reclaims the same chunk
+-----------------------------------+
| [ptr2 Data: "User Input......"]   | <-- ptr1 AND ptr2 point here!
+-----------------------------------+

T3: *ptr1 = 0xDEADBEEF; // UAF Write
    (ptr2's data is maliciously corrupted)
```

## Robust Code Example

### Anti-Pattern: The UAF Bug
```c
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

typedef struct {
    char name[32];
    int is_admin;
} User;

int main() {
    User* admin = malloc(sizeof(User));
    strcpy(admin->name, "SuperUser");
    admin->is_admin = 1;

    // The user is "logged out" and memory is freed
    free(admin);

    // ... Later in the program ...
    
    // A new struct happens to allocate the same physical heap chunk
    char* string_buffer = malloc(32);
    strcpy(string_buffer, "MaliciousPayload");

    // CRITICAL BUG: Using the 'admin' pointer after it was freed.
    // If the attacker can trigger this, they check admin->is_admin,
    // which might now be corrupted or controlled by string_buffer.
    if (admin->is_admin) {
        printf("Admin access granted! (VULNERABILITY TRIGGERED)\n");
    }

    free(string_buffer);
    return 0;
}
```

### The Solution: Pointer Nullification & Smart Ownership
The simplest mitigation in C is defensive nullification immediately after freeing. However, true resolution requires strict ownership semantics—ensuring no alias pointers remain.

```c
#include <stdlib.h>

// A macro to safely free and nullify pointers
#define SAFE_FREE(ptr) do { \
    free(ptr);              \
    (ptr) = NULL;           \
} while(0)

int main() {
    int* data = malloc(sizeof(int));
    if (!data) return 1;
    *data = 100;

    // Use SAFE_FREE to eliminate the UAF risk at this scope
    SAFE_FREE(data);

    // Subsequent uses will cause a deterministic segfault (Null Pointer Dereference),
    // which is a denial-of-service, but much safer than arbitrary code execution.
    if (data != NULL) {
        *data = 200; // This branch is safely avoided
    }

    return 0;
}
```