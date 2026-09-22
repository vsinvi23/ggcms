# Structs and Memory Alignment

## The Problem
When defining a `struct` in C, you might assume its size in memory is exactly the sum of the sizes of its members. However, printing `sizeof(struct)` often reveals it is larger. This is due to memory alignment and padding.

CPUs read memory in "word" sizes (e.g., 4 bytes on 32-bit, 8 bytes on 64-bit systems). If a variable crosses a word boundary, the CPU might need two read cycles to fetch it, or it might trigger a hardware alignment fault. To prevent this, compilers insert invisible "padding" bytes between struct members.

## Technical Architecture

Consider a 64-bit architecture where the word size is 8 bytes. Compilers align data based on its type size. A 4-byte `int` wants to sit on an address cleanly divisible by 4.

```text
    Word Boundary (8 bytes wide)
+--+--+--+--+--+--+--+--+
|00|01|02|03|04|05|06|07|
+--+--+--+--+--+--+--+--+

Struct Layout Unoptimized:
char a; int b; char c;

+--+--+--+--+--+--+--+--+
| a|XX|XX|XX| b| b| b| b|  <-- 'a' takes 1 byte, 3 bytes padding (XX)
+--+--+--+--+--+--+--+--+
| c|XX|XX|XX|XX|XX|XX|XX|  <-- 'c' takes 1 byte, 7 bytes padding at the end
+--+--+--+--+--+--+--+--+
Total Size: 16 bytes.
Actual Data: 6 bytes.
Padding: 10 bytes. (Wasted!)
```

## Robust Code Example

### Anti-Pattern: Unoptimized Struct Layout
```c
#include <stdio.h>

// Poorly aligned struct
struct Unoptimized {
    char a;     // 1 byte
                // 3 bytes padding inserted here to align 'b' to 4-byte boundary
    int b;      // 4 bytes
    char c;     // 1 byte
                // 3 bytes padding inserted here to align the whole struct to 4 bytes
};

int main() {
    printf("Size of char: %zu\n", sizeof(char)); // 1
    printf("Size of int: %zu\n", sizeof(int));   // 4
    
    // Expected: 1 + 4 + 1 = 6 bytes
    // Actual: 12 bytes (on 32/64 bit systems)
    printf("Size of Unoptimized struct: %zu\n", sizeof(struct Unoptimized));
    return 0;
}
```

### The Solution: Member Reordering
Sort struct members from largest to smallest. This minimizes the padding required to satisfy alignment constraints.

```c
#include <stdio.h>

// Optimized struct
struct Optimized {
    int b;      // 4 bytes
    char a;     // 1 byte
    char c;     // 1 byte
                // 2 bytes padding inserted at the end
};

int main() {
    // Expected: 4 + 1 + 1 = 6 bytes
    // Actual: 8 bytes. We saved 4 bytes per instance!
    printf("Size of Optimized struct: %zu\n", sizeof(struct Optimized));
    
    return 0;
}
```

*Note: In cases where network packets or hardware registers require exact byte layouts without padding, use compiler-specific attributes like `__attribute__((packed))` (GCC/Clang) or `#pragma pack(1)`. But beware: unaligned access penalties will apply.*