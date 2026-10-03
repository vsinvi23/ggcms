---
title: "Rust Unsafe: FFI Bindings to C Libraries"
description: "How Rust's unsafe keyword unlocks foreign function calls into C libraries, converting between Rust String and null-terminated C strings, and the discipline of wrapping unsafe FFI boundaries in safe Rust APIs."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "rust"
  - "unsafe"
  - "ffi"
  - "c-interop"
  - "cstring"
---

# Rust Unsafe: Bypassing the Borrow Checker for FFI Bindings

## The Problem: The Real World Speaks C

Rust's defining feature is its strict compiler. The borrow checker ensures memory safety and thread safety without a garbage collector by enforcing rigid rules around ownership, aliasing, and lifetimes. If you write pure Rust, you are protected from dangling pointers, use-after-free errors, and data races.

However, no language exists in a vacuum. To build useful software, you must interact with the operating system, graphics APIs, and decades of legacy libraries — almost all of which are written in C or expose a C Application Binary Interface (ABI).

C does not have a borrow checker. C freely passes around raw pointers, mutates aliased data, and expects the programmer to manually manage memory. The Rust compiler cannot mathematically prove that a C function won't corrupt memory. If Rust entirely blocked code it couldn't verify, it would be useless for systems programming.

## The Mental Model: The Unsafe Escape Hatch

To solve this, Rust provides an escape hatch: the `unsafe` keyword.

`unsafe` does not turn off the borrow checker. It does not disable type checking. It simply unlocks four specific superpowers that are normally forbidden because the compiler cannot verify their safety:

1. **Dereferencing a raw pointer** (`*const T` or `*mut T`).
2. **Calling an unsafe function** (including C functions via FFI).
3. **Accessing or modifying a mutable static variable.**
4. **Implementing an unsafe trait.**

The philosophy of `unsafe` is not "do whatever you want." It is a contract with the compiler. You are telling the compiler: *"I know you cannot prove this code is safe, but I, the human programmer, have manually verified it. Trust me."*

```text
+---------------------------------------------------+
|                  Safe Rust Code                   |
|  (Compiler guarantees no memory/threading bugs)   |
|                                                   |
|       +-----------------------------------+       |
|       |           unsafe { ... }          |       |
|       |  (Human guarantees no bugs here)  |       |
|       |     --> Calls C Function <--      |       |
|       +-----------------------------------+       |
+---------------------------------------------------+
```

## Foreign Function Interface (FFI): Talking to C

The most common use case for `unsafe` is Foreign Function Interface (FFI) — calling functions written in other languages.

To call a C function, you must first declare its signature in an `extern "C"` block. This tells Rust what the C ABI looks like. Because any call to an `extern` function might crash the program if the C code is buggy, Rust requires all such calls to be wrapped in an `unsafe` block.

### Example: Calling `abs()` from the C Standard Library

Let's call the standard C `abs` function from Rust.

```rust
// Declare the C function signature
extern "C" {
    fn abs(input: i32) -> i32;
}

fn main() {
    let x = -50;

    // The compiler cannot prove what `abs` does, so we must use `unsafe`.
    let result = unsafe {
        abs(x)
    };

    println!("Absolute value of {} is {}", x, result);
}
```

### Passing Strings: The Raw Pointer Reality

Data structures in Rust and C differ wildly. A Rust `String` is a struct containing a pointer, a length, and a capacity, and it is guaranteed to be valid UTF-8. A C string is just a raw pointer to an array of characters, terminated by a null byte (`\0`).

To pass a string to a C function (like `puts`), you must convert the Rust string into a C-compatible format, extract the raw pointer, and pass it via FFI.

```rust
use std::ffi::CString;
use std::os::raw::c_char;

extern "C" {
    fn puts(s: *const c_char) -> i32;
}

fn main() {
    // 1. Create a null-terminated CString from a Rust string
    let c_message = CString::new("Hello from Rust!").expect("CString::new failed");

    // 2. Extract the raw pointer
    // This is safe, but dereferencing it later is not.
    let raw_ptr: *const c_char = c_message.as_ptr();

    // 3. Call the C function using the raw pointer
    unsafe {
        puts(raw_ptr);
    }
    // The CString will be safely dropped here by Rust.
}
```

Note the ordering hazard hidden in this example: `raw_ptr` is only valid as long as `c_message` is alive. If `c_message` is dropped before the FFI call executes — for example, by taking `.as_ptr()` on a temporary that isn't bound to a variable — the pointer dangles and the `unsafe` call becomes undefined behavior with no compiler warning.

## Creating Safe Abstractions

The golden rule of FFI in Rust is to **contain the unsafe code**. You should never expose raw pointers or `unsafe` requirements to the rest of your Rust application.

Instead, you write a safe Rust wrapper around the unsafe FFI boundary. The wrapper handles the conversion between Rust types and C pointers, manages memory allocation (if the C code requires it), and presents a standard, safe interface that conforms to the borrow checker's rules — callers of the wrapper never need to write `unsafe` themselves.

## Summary

The `unsafe` keyword is Rust's pragmatic concession to reality. To interface with the C ecosystem, Rust allows developers to selectively bypass compiler checks to dereference raw pointers and invoke foreign functions. By containing these `unsafe` blocks within carefully designed safe wrappers, developers can leverage existing C libraries without sacrificing Rust's overarching guarantees of memory and thread safety in the broader application.
