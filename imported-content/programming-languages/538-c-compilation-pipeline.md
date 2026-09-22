# C Compilation: From Source Code to Executable

## The Problem
When a developer runs `gcc main.c -o main`, it feels like a single magical step. However, the C compilation process is actually a pipeline of four distinct, sequential tools. Understanding this pipeline is essential for debugging bizarre macro errors, linker failures, and optimizing builds.

## Technical Architecture

The compilation pipeline operates as follows:

```text
[ main.c ] (Source Code)
    |
    v
+---------------+
| Preprocessor  | (cpp) -> Expands macros, includes headers, strips comments.
+---------------+
    |
    v
[ main.i ] (Expanded Source)
    |
    v
+---------------+
| Compiler      | (cc1) -> Translates C into architecture-specific Assembly.
+---------------+
    |
    v
[ main.s ] (Assembly Code)
    |
    v
+---------------+
| Assembler     | (as) -> Converts Assembly into binary machine code (Object file).
+---------------+
    |
    v
[ main.o ] (Object File - Unlinked)
    |
    v
+---------------+
| Linker        | (ld) -> Combines object files and libraries into an executable.
+---------------+
    |
    v
[ main ] (Final Executable binary)
```

## Robust Code Example

You can inspect the output of each pipeline stage using specific GCC/Clang flags.

### 1. Preprocessor (`-E`)
```bash
# Outputs the raw C code after all #include and #define directives are expanded.
gcc -E main.c -o main.i
```
*Why use it?* To debug complex nested macros. If a macro isn't expanding how you expect, looking at `main.i` reveals exactly what the compiler sees.

### 2. Compiler (`-S`)
```bash
# Outputs human-readable Assembly instructions.
gcc -S main.c -o main.s
```
*Why use it?* To verify if the compiler is optimizing your code properly (e.g., checking if a loop was unrolled or an Undefined Behavior branch was deleted).

### 3. Assembler (`-c`)
```bash
# Outputs the binary Object file. Contains machine code, but no memory addresses yet.
gcc -c main.c -o main.o
```
*Why use it?* In large projects, you compile `.c` files into `.o` files individually. If one `.c` file changes, you only recompile that single `.o` file, saving massive amounts of build time (this is what `Makefiles` do).

### 4. Linker (Default)
```bash
# Links object files into the final binary.
gcc main.o math.o -o my_program
```
*Why use it?* To resolve external symbols. If `main.o` calls `printf`, the linker finds the `printf` implementation in `libc` and wires the addresses together.
