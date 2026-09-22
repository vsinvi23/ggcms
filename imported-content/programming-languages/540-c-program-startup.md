# How a C Program Actually Starts and Ends

## The Problem
Every C programmer is taught that execution begins at `main()`. This is a lie.

By the time the first line of `main()` runs, the operating system and the C Runtime (CRT) have already executed thousands of lines of setup code. If you don't understand what happens before and after `main()`, you can't debug initialization crashes, write bare-metal embedded code, or understand how environment variables reach your application.

## Technical Architecture

When you execute a binary, the OS Kernel's loader (e.g., the ELF loader on Linux) maps the program into memory and jumps to the program's true entry point, usually a symbol named `_start`.

```text
+-----------------------+
| OS Loader (execve)    | Maps binary to RAM, sets up stack.
+-----------------------+
           | jumps to
           v
+-----------------------+
| _start (in crt0.o)    | Assembly code provided by libc.
+-----------------------+ Sets up CPU registers, aligns stack.
           | calls
           v
+-----------------------+
| __libc_start_main     | Initializes threading, standard I/O (stdin/out/err),
+-----------------------+ parses argc/argv/envp, calls global constructors.
           | calls
           v
+-----------------------+
| main(argc, argv)      | YOUR CODE RUNS HERE.
+-----------------------+
           | returns
           v
+-----------------------+
| exit() / _exit()      | Flushes stdout buffers, calls atexit() handlers,
+-----------------------+ returns exit code to the OS Kernel.
```

## Robust Code Example

### Hooking Before and After `main`

You can use compiler-specific attributes to execute code before `main()` (during `__libc_start_main`) and after `main()` (during `exit()`).

```c
#include <stdio.h>
#include <stdlib.h>

// GCC/Clang attribute to run before main()
__attribute__((constructor))
void pre_main_setup() {
    printf("[1] Constructor: Setting up subsystem before main()...\n");
}

// GCC/Clang attribute to run after main() finishes
__attribute__((destructor))
void post_main_cleanup() {
    printf("[4] Destructor: Cleaning up after main() returned...\n");
}

// Standard POSIX way to hook exit
void my_atexit_handler() {
    printf("[3] atexit handler: Flushing custom buffers...\n");
}

int main(int argc, char** argv) {
    // Register the standard exit handler
    atexit(my_atexit_handler);
    
    printf("[2] main: Application is running.\n");
    
    return 0; // Returning from main triggers exit(), which triggers the destructors
}
```

### Output:
```text
[1] Constructor: Setting up subsystem before main()...
[2] main: Application is running.
[3] atexit handler: Flushing custom buffers...
[4] Destructor: Cleaning up after main() returned...
```

If you compile code with `gcc -nostdlib main.c`, the compiler omits `crt0.o` and libc entirely. The linker will complain that `_start` is missing, forcing you to write the raw assembly entry point yourself—a mandatory rite of passage for OS developers.
