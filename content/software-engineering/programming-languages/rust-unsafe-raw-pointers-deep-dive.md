---
title: "Rust Unsafe Code: Raw Pointers Deep Dive"
description: "Dereferencing *const T and *mut T raw pointers inside unsafe blocks, why creating a raw pointer is safe but dereferencing it isn't, and how the LLVM optimizer's aliasing assumptions turn careless raw-pointer use into undefined behavior."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "rust"
  - "unsafe"
  - "raw-pointers"
  - "undefined-behavior"
  - "llvm"
---

# Rust Unsafe Code: Dereferencing Raw Pointers and Bypassing the Borrow Checker

## The Problem: Memory Safety vs. Hardware Reality

Rust's primary selling point is its relentless enforcement of memory safety via the borrow checker. At compile time, it guarantees that references are always valid, preventing data races, dangling pointers, and double-frees. However, the hardware that executes our software does not inherently understand lifetimes, ownership, or borrowing.

When you write low-level systems code — such as an operating system kernel, a device driver, or a Foreign Function Interface (FFI) to a C library — you inevitably hit the boundaries of what the borrow checker can statically prove. The compiler operates on a conservative premise: if it cannot mathematically prove that a memory operation is safe, it rejects it. This strictness becomes a roadblock when building complex data structures like doubly-linked lists or when mapping hardware registers to memory addresses, necessitating an "escape hatch."

## The Mental Model: The Compiler Blindfold

Enter the `unsafe` keyword. The most common misconception about `unsafe` Rust is that it turns off the compiler's checks entirely. This is false. The borrow checker is still fully active inside an `unsafe` block for standard references and variables.

Instead, think of `unsafe` as a **compiler blindfold for specific operations**. You are essentially telling the compiler: *"I have manually proven that these specific hardware-level operations are safe. Trust me, I know what I'm doing."*

By using `unsafe`, you gain access to four specific superpowers:

1. Dereferencing raw pointers (`*const T` and `*mut T`).
2. Calling `unsafe` functions or methods (like FFI calls).
3. Accessing or modifying mutable static variables.
4. Implementing an `unsafe` trait.

When working with raw pointers, Rust no longer tracks lifetimes or aliasing rules for those specific pointers. It becomes your responsibility to ensure you are not creating undefined behavior (UB).

## Visualizing the Memory Boundary

```text
+-------------------------+      unsafe { ... }       +-------------------------+
|     Safe Rust Realm     | ========================> |    Unsafe Rust Realm    |
|                         |                           |                         |
| - Lifetime tracking     |  Dereferencing raw ptrs   | - No lifetime tracking  |
| - 1 Mut OR Many Immut   |  Calling C libraries      | - Direct memory access  |
| - Compile-time checks   | <======================== | - Programmer enforces   |
| - Zero undefined struct |      Safe wrappers        |   memory safety (UB)    |
+-------------------------+                           +-------------------------+
```

## Deep Dive & Code: Raw Pointers in Action

Raw pointers in Rust come in two flavors: `*const T` (immutable) and `*mut T` (mutable). Creating a raw pointer is entirely safe — it's just an address. It is only the *dereferencing* of that pointer that requires an `unsafe` block, because only at the point of dereferencing does the program attempt to access the memory address, which might be invalid.

Let's look at a practical example where we create raw pointers and dereference them to manipulate memory directly.

```rust
fn main() {
    let mut data: i32 = 42;

    // SAFE: Creating raw pointers from valid references
    let raw_const_ptr: *const i32 = &data as *const i32;
    let raw_mut_ptr: *mut i32 = &mut data as *mut i32;

    // We can even create pointers to arbitrary memory addresses.
    // This is useful in embedded programming to access hardware registers.
    let arbitrary_ptr = 0xdeadbeefusize as *const u8;

    // UNSAFE: Dereferencing the pointers
    unsafe {
        // Read via the constant raw pointer
        println!("Value at const pointer: {}", *raw_const_ptr);

        // Write via the mutable raw pointer
        *raw_mut_ptr = 100;

        // Read again to verify the mutation
        println!("Value after mutation: {}", *raw_const_ptr);

        // DANGER: Dereferencing `arbitrary_ptr` here would likely
        // cause a segmentation fault since 0xdeadbeef is invalid.
        // let crash = *arbitrary_ptr;
    }

    assert_eq!(data, 100);
}
```

In the code above, we bypass the standard borrowing rules. Normally, holding both an immutable reference and a mutable reference simultaneously is heavily forbidden by Rust. However, raw pointers are entirely exempt from the borrow checker's aliasing rules at compile time — `raw_const_ptr` and `raw_mut_ptr` coexist and point at the same `data` without a compile error.

## Undefined Behavior and Aliasing

The most dangerous aspect of bypassing the borrow checker is inadvertently triggering undefined behavior (UB). While the compiler doesn't enforce aliasing rules on raw pointers, the LLVM optimizer backend *still assumes* that mutable references (`&mut T`) derived from them are completely exclusive wherever such a reference exists in the generated IR.

If you use raw pointers to bypass the borrow checker and create multiple mutable references to the same memory location, LLVM will optimize the code based on the assumption that those references do not alias. This leads to horrific, impossible-to-debug logic errors where memory reads and writes are reordered or optimized out entirely — the exact class of bug the borrow checker exists to prevent, resurfacing precisely because `unsafe` removed its protection.

Whenever you write `unsafe` code to handle raw pointers, your absolute highest priority must be wrapping it in a safe API that restores the borrow checker's invariants for the end-user.

## Conclusion

Rust's `unsafe` and raw pointers provide a necessary bridge between theoretical memory safety and the chaotic reality of hardware and system integrations. By understanding that `unsafe` transfers the burden of proof from the compiler to the developer, you can write highly optimized, low-level routines while exposing perfectly safe APIs to the rest of your application.
