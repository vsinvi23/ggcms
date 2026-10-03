---
title: "Go Slices Under the Hood: Header, Capacity, and Append Reallocation"
description: "Why a Go slice is a lightweight header over a shared array, how mutating one slice can silently corrupt another, and how Go's runtime grows slices when append exceeds capacity."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "go"
  - "golang"
  - "slices"
  - "memory-management"
  - "arrays"
  - "performance"
---

# Go Slices Under the Hood: Header, Capacity, and Append Reallocation

Go slices are one of the most frequently used yet widely misunderstood primitives in the language. Many developers treat them like dynamic arrays in Python or C++'s `std::vector`. Treating a slice as a pure dynamic array leads to subtle bugs: unexpected mutations of unrelated variables, or slices that silently keep a much larger underlying array alive than you think.

A Go slice does not store any data itself. It is a small, lightweight header describing a contiguous window into an underlying array. Understanding that distinction is essential for writing efficient, bug-free Go.

---

## The Mental Model: The Slice Header

Under the hood, a slice is a 24-byte struct (on 64-bit architectures), defined in `runtime/slice.go`. It has exactly three fields:

1. **Pointer (`array`):** points at the first element of the underlying array the slice references — not necessarily the array's own first element.
2. **Length (`len`):** number of elements currently in the slice.
3. **Capacity (`cap`):** total number of elements available in the underlying array, counted from the slice's start.

```
       +--------------------------------------------+
       |                Slice Header                |
       |  array: 0x1044ba0  |  len: 3  |  cap: 5    |
       +---------+----------------------------------+
                 |
                 v
 Underlying Array: [ 100, 200, 300, 400, 500 ]
                    ^              ^           ^
                    |              |           |
               Slice Start      len end     cap end
```

When you slice an existing slice (`b := a[1:3]`), Go creates a *new slice header* pointing into the *same* underlying array, with adjusted length and capacity. No data is copied.

---

## The Danger of Shared Memory

Because multiple slice headers can point at the same underlying array, mutating one can silently mutate another.

```go
package main

import "fmt"

func main() {
	// Allocate an array of 5, slice it to len 3, cap 5
	original := make([]int, 3, 5)
	original[0], original[1], original[2] = 10, 20, 30

	// sub references the same underlying array
	sub := original[1:3] // len: 2, cap: 4
	fmt.Printf("Before - original: %v, sub: %v\n", original, sub)

	// Mutating sub directly mutates original!
	sub[0] = 99
	fmt.Printf("After Mutate - original: %v, sub: %v\n", original, sub)

	// Appending to sub, still within its capacity, overwrites original's slot!
	sub = append(sub, 40)
	fmt.Printf("After Append - original: %v, sub: %v\n", original, sub)
}
```

Running this prints:

```
Before - original: [10 20 30], sub: [20 30]
After Mutate - original: [10 99 30], sub: [99 30]
After Append - original: [10 99 30 40], sub: [99 30 40]
```

`original` gained a fourth element it never explicitly appended, purely because `sub` still had spare capacity inside the same backing array.

### The Fix: Force a Reallocation with the Three-Index Slice Expression

`original[1:3:3]` sets `sub`'s capacity equal to its length, so the next `append` is guaranteed to allocate a brand-new backing array instead of writing into `original`'s tail:

```go
// Force reallocation on append by pinning capacity to length
safeSub := original[1:3:3] // len: 2, cap: 2
safeSub = append(safeSub, 40) // Reallocates a new underlying array — original is untouched
```

---

## Under the Hood: How Slices Grow

When `append` exceeds a slice's capacity, the runtime allocates a larger backing array, copies the existing elements across, and returns a new header pointing at the new array. This is why appending in a loop *feels* like O(1) amortized but every capacity-exceeding call is an O(n) copy.

Go's growth strategy has evolved over releases. In modern Go (1.18+):

- If the current capacity is **less than 256**, capacity doubles (growth factor 2.0).
- If the current capacity is **256 or more**, the new capacity is computed as:

  ```
  new_cap = old_cap + (old_cap + 3*256) / 4
  ```

  This tapers the growth factor down from 2.0 toward roughly 1.25 as slices get very large, trading a bit more copying for a lot less wasted memory on huge slices.

```text
cap growth (illustrative, modern Go):

  cap:   1 -> 2 -> 4 -> 8 -> ... -> 128 -> 256 -> 320 -> 400 -> 500 -> ...
                     (doubling below 256)     (tapering growth above 256)
```

---

## Key Takeaways

- **Slices share memory.** Re-slicing an existing slice never copies data — mutating a derived slice can mutate the original if their capacities overlap.
- **Pre-allocate when you know the size.** `make([]T, 0, capacity)` avoids repeated reallocation and copying, which is both a CPU and a GC-pressure win.
- **Watch for accidental memory retention.** If you only need a small window of a huge slice, `copy()` the needed elements into a fresh, right-sized slice so the giant original backing array can be garbage collected.
