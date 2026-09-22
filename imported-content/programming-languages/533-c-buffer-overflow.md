# Buffer Overflow from First Principles

## The Problem
A buffer overflow happens when a program writes more data to a block of memory (buffer) than it was allocated to hold. Because C does not perform implicit bounds checking, the excess data overwrites adjacent memory spaces. 

On the stack, this is catastrophic. Stack frames store critical control flow data, specifically the Return Instruction Pointer (EIP/RIP). By overflowing a local buffer, an attacker can overwrite this pointer, hijacking the execution flow to run arbitrary code (e.g., shellcode).

## Technical Architecture

When a function is called, a stack frame is constructed. The stack grows downwards (from higher to lower memory addresses). However, buffers are written upwards (from lower to higher addresses). 

```text
    Stack Layout (x86 architecture)
    High Memory
+-----------------------+
| Function Arguments    |
+-----------------------+
| Return Address (EIP)  | <-- Target for hijack
+-----------------------+
| Saved Base Ptr (EBP)  |
+-----------------------+
| char buffer[8]        | <-- Buffer starts here
+-----------------------+
    Low Memory

Write direction: [buffer] ----> [EBP] ----> [EIP]
If we write 16 bytes into buffer[8], we overwrite EBP and EIP!
```

## Robust Code Example

### Anti-Pattern: Smashing the Stack
```c
#include <stdio.h>
#include <string.h>

void secret_function() {
    printf("Execution hijacked! You shouldn't be here.\n");
}

void process_input(const char* user_input) {
    char buffer[16];
    
    // CRITICAL BUG: strcpy does not check the bounds of 'buffer'.
    // It stops only when it hits a null terminator ('\0') in user_input.
    strcpy(buffer, user_input);
    
    printf("Processed: %s\n", buffer);
}

int main(int argc, char** argv) {
    if (argc < 2) return 1;
    
    // Providing a string larger than 16 bytes will overflow the buffer,
    // overwrite the saved base pointer, and eventually the return address.
    process_input(argv[1]);
    
    return 0;
}
```

### The Solution: Bounded String Operations
Never use unbounded functions (`strcpy`, `strcat`, `gets`, `sprintf`). Use their bounded equivalents (`strncpy`, `strncat`, `snprintf`), and always ensure null-termination.

```c
#include <stdio.h>
#include <string.h>

void safe_process_input(const char* user_input) {
    char buffer[16];
    
    // Solution 1: Use strncpy
    // Note: strncpy does NOT guarantee null-termination if the source 
    // is longer than the destination size.
    strncpy(buffer, user_input, sizeof(buffer) - 1);
    
    // Explicitly enforce null-termination
    buffer[sizeof(buffer) - 1] = '\0';
    
    printf("Safely Processed: %s\n", buffer);
    
    // Solution 2 (Preferred in modern C code): snprintf
    // snprintf guarantees null termination.
    char buffer2[16];
    snprintf(buffer2, sizeof(buffer2), "%s", user_input);
}

int main() {
    // Even if input is 100 bytes long, the buffer will only take 15 + '\0'
    safe_process_input("This input is significantly larger than sixteen bytes.");
    return 0;
}
```