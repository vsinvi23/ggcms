# Go Slices Under the Hood: Pointers, Length, Capacity, and Append Reallocations

Go slices are one of the most frequently used yet widely misunderstood primitives in the language. Many developers treat them as dynamic arrays similar to Python lists or C++ vectors. However, treating a slice as a pure dynamic array leads to subtle bugs, such as unexpected mutations in unrelated variables, or silent memory leaks. 

In Go, a slice does not store any data itself. Instead, it is a small, lightweight header that describes a contiguous section of an underlying array. Understanding this distinction is crucial for writing efficient, bug-free Go programs.

---

## The Mental Model: The Slice Header

Under the hood, a slice is represented as a 24-byte struct (on 64-bit architectures) within the runtime library (`runtime/slice.go`). It consists of exactly three fields:

1. **Pointer (`array`):** A pointer to the first element of the underlying array that the slice references (which is not necessarily the array's absolute starting element).
2. **Length (`len`):** The number of elements currently in the slice.
3. **Capacity (`cap`):** The total number of elements in the underlying array, counting from the first element of the slice.

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

When you slice an existing slice (e.g., `b := a[1:3]`), Go creates a new slice header that points to a different index of the same underlying array, adjusting the length and capacity accordingly. No data copying occurs.

---

## The Code: The Danger of Shared Memory

### The Problem: Unexpected Mutation
Because multiple slices can point to the same underlying array, appending to or modifying one slice can silently alter another.

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

	// Appending to sub within its capacity overwrites original's slot!
	sub = append(sub, 40)
	fmt.Printf("After Append - original: %v, sub: %v\n", original, sub)
}
```

### The Solution: Predictable Allocation
To avoid shared mutations, pre-allocate or force Go to create a new underlying array using the three-index slice expression `original[1:3:3]`, which restricts the capacity of `sub` to its length, forcing any subsequent `append` to trigger a reallocation.

```go
// Force reallocation on append by setting capacity equal to length
safeSub := original[1:3:3] // len: 2, cap: 2
safeSub = append(safeSub, 40) // Reallocates a new underlying array
```

---

## Under the Hood: Growing Slices

When an `append` operation exceeds the slice's capacity, Go's runtime allocates a larger underlying array, copies the existing elements, and returns a new slice header pointing to the new array.

The growth strategy in Go's runtime has evolved. Historically, Go doubled capacity below 1024 elements and added 25% above that. In modern Go (1.18+), the transition is smoother:
* If the capacity is less than 256, it still doubles (factor of 2.0).
* If the capacity is 256 or more, the capacity is calculated as: `new_cap = old_cap + (old_cap + 3 * 256) / 4`. This reduces the growth factor from 2.0 to a limit of 1.25 as the slice becomes very large.

---

## Key Takeaways

* **Slices Share Memory:** Slicing an existing slice does not copy data. Be cautious when mutating slices that share an underlying array.
* **Pre-allocate When Possible:** Use `make([]T, 0, capacity)` if you know the final size. This eliminates the CPU overhead of repetitive reallocations and garbage collection pressure.
* **Prevent Memory Leaks:** If you need a small subset of a large slice, use `copy` to move the required elements into a new slice, allowing the massive underlying array of the original slice to be garbage collected.
