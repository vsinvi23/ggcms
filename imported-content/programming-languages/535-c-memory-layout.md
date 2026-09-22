# C Memory Layout Explained

## The Problem
Understanding where variables are stored physically in memory is critical for writing performant, secure C code. Misunderstanding the memory layout leads to bugs like returning stack variables, attempting to write to read-only text segments, or causing heap fragmentation.

When a C program compiles into an executable and is loaded into RAM, the operating system assigns it a virtual address space split into distinct segments.

## Technical Architecture

The typical memory layout for a C process consists of five main segments:

```text
    High Memory Addresses
+-----------------------------+
| Environment Vars & CLI args |
+-----------------------------+
| Stack (Grows Down)          |  <-- Local variables, function args, return addresses
|      |                      |
|      v                      |
+-----------------------------+
|            ...              |
+-----------------------------+
|      ^                      |
|      |                      |
| Heap (Grows Up)             |  <-- Dynamic allocation (malloc/calloc)
+-----------------------------+
| BSS Segment (Uninitialized) |  <-- Uninitialized globals/statics (Zeroed by OS)
+-----------------------------+
| Data Segment (Initialized)  |  <-- Initialized globals/statics
+-----------------------------+
| Text Segment (Code)         |  <-- Compiled machine instructions (Read-Only)
+-----------------------------+
    Low Memory Addresses
```

## Robust Code Example

Let's look at exactly where different C constructs live in this layout.

```c
#include <stdio.h>
#include <stdlib.h>

// 1. DATA SEGMENT: Global initialized variables
int global_init = 42; 

// 2. BSS SEGMENT: Global uninitialized variables (automatically zeroed)
int global_uninit; 

void function_frame() {
    // 3. DATA SEGMENT: Static initialized variables (persists across calls)
    static int static_init = 10;
    
    // 4. BSS SEGMENT: Static uninitialized
    static int static_uninit;

    // 5. STACK SEGMENT: Local variables
    int local_var = 5;

    printf("Stack Local: %p\n", (void*)&local_var);
}

int main() {
    // 6. TEXT SEGMENT: String literals are usually placed in a read-only 
    // section of the text/data segment (e.g., .rodata).
    // Attempting to modify this string will cause a Segmentation Fault.
    char* string_literal = "Read Only String"; 
    
    // 7. STACK SEGMENT: This is an array allocated on the stack, 
    // initialized BY copying the string literal into it. It is mutable.
    char mutable_string[] = "Mutable String";

    // 8. HEAP SEGMENT: Dynamically allocated memory
    int* heap_var = (int*)malloc(sizeof(int));
    *heap_var = 100;

    // Print out the memory map conceptually
    printf("--- Memory Layout Addresses ---\n");
    printf("Function (Text): %p\n", (void*)function_frame);
    printf("Global Init (Data): %p\n", (void*)&global_init);
    printf("Global Uninit (BSS): %p\n", (void*)&global_uninit);
    printf("Heap Allocation (Heap): %p\n", (void*)heap_var);
    
    function_frame(); // Prints the stack address

    free(heap_var);
    return 0;
}
```