# Go Memory Alignment: Struct Padding and CPU Word-aligned Fetching Optimizations

## The CPU Word Architecture
When optimizing high-performance Go applications, developers often focus on algorithms, ignoring physical hardware layouts. Modern CPUs do not read memory byte-by-byte; they fetch memory in fixed-size chunks called "words" (typically 8 bytes on a 64-bit architecture). 

If a variable spans across two memory words, the CPU must execute two fetch instructions and stitch the bytes together via bit-shifting. This misaligned access incurs a significant performance penalty. To prevent this, the Go compiler enforces strict **Memory Alignment** rules, ensuring variables reside at hardware-friendly memory boundaries.

## The Rule of Alignment
The alignment guarantee in Go dictates that the memory address of a variable of type `T` must be a multiple of its alignment factor (`unsafe.Alignof(T)`). 

- `int8`, `bool` (1 byte): Alignment 1 (can sit anywhere)
- `int16` (2 bytes): Alignment 2 (address must be even)
- `int32`, `float32` (4 bytes): Alignment 4
- `int64`, `float64`, pointers (8 bytes): Alignment 8 (address must end in 0 or 8)

When you compose these types into a `struct`, the compiler inserts hidden padding (wasted empty bytes) between fields to ensure subsequent fields meet their alignment requirements.

## The High Cost of Struct Padding
Consider a poorly designed struct:

```go
package main

import (
	"fmt"
	"unsafe"
)

type BadStruct struct {
	A bool  // 1 byte
	B int64 // 8 bytes
	C bool  // 1 byte
}

func main() {
	fmt.Printf("Size: %d bytes\n", unsafe.Sizeof(BadStruct{}))
}
```

Intuitively, 1 + 8 + 1 = 10 bytes. However, `unsafe.Sizeof` reports **24 bytes**. Why?

```ascii
[Memory Layout of BadStruct]
| A (1b) | Pad (7b) | ---> Next field (B) must align to 8-byte boundary
|      B (8b)       |
| C (1b) | Pad (7b) | ---> Overall struct size aligns to largest field (8)
```
The compiler inserts 7 bytes of padding after `A` so that `B` starts at a clean 8-byte boundary. It adds another 7 bytes of padding after `C` because the total size of a struct must be a multiple of its largest alignment requirement. 

If you create a slice of `[]BadStruct` with 1,000,000 elements, you are wasting 14 MB of RAM purely on invisible padding, negatively impacting CPU cache locality.

## Optimizing Struct Layout
To eliminate padding, the golden rule of struct design is: **Order fields from largest to smallest.**

```go
type GoodStruct struct {
	B int64 // 8 bytes
	A bool  // 1 byte
	C bool  // 1 byte
	// 6 bytes trailing padding
}
```

Now, `B` requires no padding. `A` and `C` are packed sequentially. The compiler only needs 6 bytes of padding at the end of the struct, reducing the total size to **16 bytes**—a 33% memory saving without changing any logic.

## Analysis Tooling
You do not have to calculate this manually. The `fieldalignment` analyzer from the Go `x/tools` suite can automatically detect and suggest optimal struct layouts.

```bash
# Install the tool
go install golang.org/x/tools/go/analysis/passes/fieldalignment/cmd/fieldalignment@latest

# Run against your project
fieldalignment -fix ./...
```
*Note: Be cautious running the `-fix` flag on structs used in public APIs or encoding (like fixed-length binary parsing), as changing the field order breaks compatibility.*

## False Sharing and Cache Lines
While packing structs minimizes RAM usage, extremely tight packing can lead to a multiprocessor hazard known as **False Sharing**. CPUs load memory into 64-byte Cache Lines. If Thread 1 constantly mutates field `A`, and Thread 2 constantly mutates field `B`, and they share a cache line, the CPU hardware will thrash cache invalidations between cores, severely degrading performance. In rare, highly concurrent scenarios, you must purposefully *inject* padding (`_ [56]byte`) to force variables onto separate cache lines.

## Conclusion
Understanding Go memory alignment ensures you write structs that are gentle on CPU caches and system RAM. By merely reordering fields from largest to smallest, you can drastically reduce your application's memory footprint and improve cache locality with zero algorithmic complexity.
