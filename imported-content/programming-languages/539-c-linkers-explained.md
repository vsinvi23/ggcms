# Linkers Explained from Scratch

## The Problem
You compile your C program and receive the dreaded `undefined reference to 'foo'` error. The compiler succeeded, but the build failed. Why? 

The compiler only translates individual `.c` files into `.o` (object) files. If `main.c` calls a function `calculate()` defined in `math.c`, the compiler just leaves a "blank space" (a relocation entry) in `main.o`. It is the **Linker's** job to stitch these object files together, find where `calculate()` actually lives, and fill in the blanks.

## Technical Architecture

Object files contain sections (Text, Data, BSS) and a **Symbol Table**. The Symbol table lists what the object file *provides* (exports) and what it *needs* (imports).

```text
[ main.o ]
  Provides: main
  Needs:    calculate (Address unknown: 0x????)

[ math.o ]
  Provides: calculate (Located at offset 0x00 within math.o)
  Needs:    (Nothing)

    +-------------------+
    |      LINKER       |
    +-------------------+
              |
              v

[ Final Executable ]
  Address 0x400100: calculate() { ... }
  Address 0x400200: main() {
      call 0x400100  <--- Linker patched the address here!
  }
```

## Robust Code Example

### The Code
**math.c**
```c
// Provides 'calculate'
int calculate(int x) {
    return x * 2;
}
```

**main.c**
```c
#include <stdio.h>

// Forward declaration: tells the compiler "this exists somewhere".
int calculate(int); 

int main() {
    // Compiler leaves a placeholder here. Linker resolves it.
    printf("Result: %d\n", calculate(10)); 
    return 0;
}
```

### The Linking Process

**Step 1: Independent Compilation**
```bash
gcc -c main.c -o main.o
gcc -c math.c -o math.o
```
At this point, if you inspect `main.o` using `nm` (a tool to list symbols), you'll see:
```text
$ nm main.o
         U calculate   <-- 'U' means Undefined! 
00000000 T main        <-- 'T' means Text (Code) segment
```

**Step 2: Linking**
```bash
gcc main.o math.o -o my_app
```
The linker sees `main.o` needs `calculate`. It looks at `math.o`, finds `calculate`, assigns it a final memory address in the executable, and patches the `call` instruction in `main.o`.

### Common Linker Errors
1. **Undefined Reference:** You called a function but forgot to link the object file or library containing it (e.g., forgetting `-lm` when using `math.h`).
2. **Multiple Definition:** You defined the exact same function (or global variable without `extern`) in two different `.c` files. The linker doesn't know which one to use.
