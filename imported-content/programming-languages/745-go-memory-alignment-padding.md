# Go Memory Alignment: Struct Padding and CPU Word-aligned Fetching Optimizations

## The Problem: The Mystery of the Bloated Struct

Suppose you are writing a high-performance database engine or processing billions of logs in Go. To save memory, you carefully select the smallest primitive types for your metadata struct: a single-byte boolean, a 64-bit integer, and a 16-bit integer.

Mathematically, you expect this struct to occupy $1 + 8 + 2 = 11$ bytes. However, when you query the size of this struct at runtime using `unsafe.Sizeof()`, the Go runtime reports that it occupies **24 bytes**—more than double your calculation!

```go
type Metadata struct {
	IsActive bool   // 1 byte
	ID       int64  // 8 bytes
	Status   int16  // 2 bytes
}
```

This is not a bug in Go. It is a mandatory performance optimization enforced by hardware boundaries. Without proper field ordering, your structures are inflated with silent, useless "padding bytes," which wastes heap memory and degrades CPU cache hit ratios.

---

## Architectural Mechanics: Word Size and Memory Alignment

Modern 64-bit CPU architectures do not read memory byte-by-byte. Instead, they fetch data in fixed-size blocks called **words** (typically 8 bytes / 64 bits on modern systems).

```
   Poorly Ordered (24 bytes total, lots of padding)
   Address:   0x00     0x01                          0x08                 0x10         0x12
   Word 1:   [Active] [Pad Padding Padding ... x7]  [  -  -  -  - ID -  -  -  -  ]
   Word 2:   [Status] [Pad Padding x6            ]

   Optimized (16 bytes total, minimal padding)
   Address:   0x00                                  0x08                 0x10
   Word 1:   [  -  -  -  - ID -  -  -  -  ]         [Status] [Active] [Pad x5]
```

To maximize memory access efficiency and prevent double-fetching penalty (where a single variable crosses a word boundary, forcing the CPU to perform two cache reads to fetch a single value), compilers enforce **Memory Alignment Rules**:

1.  **Type Alignment:** A value of a specific type must reside at a memory address that is a multiple of its size. For example, an `int64` (8 bytes) must start at an address divisible by 8. An `int16` (2 bytes) must start at an address divisible by 2.
2.  **Struct Alignment:** The total size of a struct is always padded to match a multiple of the largest alignment factor of any of its fields. If your struct contains an `int64` field, the entire struct's size must be a multiple of 8 bytes.

In our poorly ordered struct, `IsActive` (offset 0) is followed by `ID` (8 bytes). To ensure `ID` starts at an address divisible by 8, the compiler inserts 7 padding bytes between `IsActive` and `ID`. `Status` (2 bytes) is placed at offset 16. To make the entire struct's size a multiple of 8 (since `ID` requires 8-byte alignment), the compiler appends 6 trailing padding bytes, bringing the total size to 24 bytes.

---

## The Solution: Descending Size Struct Ordering

By sorting struct fields from **largest to smallest**, we allow smaller fields to pack tightly into the natural alignment gaps of the larger fields.

The following program demonstrates the dramatic memory optimization achieved solely by reorganizing struct fields.

```go
package main

import (
	"fmt"
	"unsafe"
)

// PoorlyAligned: Fields are ordered arbitrarily, forcing the compiler 
// to insert padding to maintain word alignment.
type PoorlyAligned struct {
	IsActive  bool   // 1 byte  (Offset 0)
	// --- 7 bytes of padding inserted here ---
	ID        int64  // 8 bytes (Offset 8)
	Status    int16  // 2 bytes (Offset 16)
	// --- 6 bytes of padding appended here to round struct size to multiple of 8 ---
}

// PerfectlyAligned: Fields are sorted from largest to smallest.
// This allows smaller types to pack into the remaining space without padding.
type PerfectlyAligned struct {
	ID        int64  // 8 bytes (Offset 0)
	Status    int16  // 2 bytes (Offset 8)
	IsActive  bool   // 1 byte  (Offset 10)
	// --- 5 bytes of padding appended here to round struct size to multiple of 8 ---
}

// TrailingZeroField: Edge case where zero-sized field at the end bloats the struct.
type TrailingZeroField struct {
	ID   int64
	Flag bool
	Zero struct{} // Zero-sized type (0 bytes) at the end!
}

func main() {
	p := PoorlyAligned{}
	o := PerfectlyAligned{}
	z := TrailingZeroField{}

	fmt.Printf("--- 1. Poorly Aligned Struct ---\n")
	fmt.Printf("Total Size: %d bytes\n", unsafe.Sizeof(p))
	fmt.Printf("Field Offsets:\n")
	fmt.Printf("  IsActive (bool):  %d\n", unsafe.Offsetof(p.IsActive))
	fmt.Printf("  ID       (int64): %d\n", unsafe.Offsetof(p.ID))
	fmt.Printf("  Status   (int16): %d\n", unsafe.Offsetof(p.Status))

	fmt.Printf("\n--- 2. Optimized Struct (Largest to Smallest) ---\n")
	fmt.Printf("Total Size: %d bytes\n", unsafe.Sizeof(o))
	fmt.Printf("Field Offsets:\n")
	fmt.Printf("  ID       (int64): %d\n", unsafe.Offsetof(o.ID))
	fmt.Printf("  Status   (int16): %d\n", unsafe.Offsetof(o.Status))
	fmt.Printf("  IsActive (bool):  %d\n", unsafe.Offsetof(o.IsActive))

	fmt.Printf("\n--- 3. Trailing Zero-Sized Field Edge Case ---\n")
	fmt.Printf("Total Size of TrailingZeroField: %d bytes\n", unsafe.Sizeof(z))
	// Because struct{} is at the end, the compiler pads the struct so a pointer
	// to 'Zero' does not point outside the struct allocation memory block, 
	// which would trigger GC pointer tracking bugs.
}
```

---

## Conclusion: Designing for Cache-Friendly Data Structures

When you execute this code, you see that `PerfectlyAligned` reduces the memory footprint from 24 bytes down to **16 bytes**—a **33% reduction** in memory usage without changing any application logic.

In high-concurrency systems, aligning your structures has a compounding benefit:
1.  **Reduced GC Pressure:** Smaller structs mean fewer allocations and faster garbage collection sweeps.
2.  **L1/L2 Cache Efficiency:** More struct instances can fit into a single 64-byte L1 cache line, reducing expensive cache-miss fetches from main memory and significantly accelerating hot execution loops.
