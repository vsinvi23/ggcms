# Go Memory Alignment: Struct Padding and CPU Word-aligned Fetching Optimizations

## The Problem: The Hidden Memory Bloat
In Go, it is common to assume that the memory footprint of a `struct` is exactly the sum of the sizes of its fields. However, examining the layout often reveals unexpected overhead. 

```go
package main

import (
	"fmt"
	"unsafe"
)

type UserData struct {
	IsActive bool    // 1 byte
	Score    float64 // 8 bytes
	Level    int16   // 2 bytes
}

func main() {
	// Expected: 1 + 8 + 2 = 11 bytes.
	// Actual: 24 bytes!
	fmt.Printf("Size: %d bytes\n", unsafe.Sizeof(UserData{}))
}
```
Why does a struct containing 11 bytes of data consume 24 bytes of RAM? The culprit is memory alignment and structural padding inserted by the Go compiler.

## The Architectural Cause: CPU Word Fetching
Modern CPUs do not read memory one byte at a time. To maximize throughput, the memory controller fetches data in "words"—chunks of 4 bytes (on 32-bit architectures) or 8 bytes (on 64-bit architectures) per clock cycle.

If a 64-bit float (8 bytes) is stored at a memory address that is not a multiple of 8, the CPU would need to execute *two* memory fetch cycles to read the two halves of the float, followed by a bitwise shift and merge operation to reconstruct the value. This "unaligned access" incurs a massive performance penalty and, on some architectures (like ARM), can trigger hardware faults.

### The Alignment Mandate
To ensure zero-overhead data access, the Go compiler enforces alignment guarantees. A variable of size `N` must have a memory address that is a multiple of `N` (up to the maximum word size of the architecture, usually 8 bytes).

To satisfy this mandate within contiguous memory blocks (like structs or arrays), the compiler automatically injects invisible, unused bytes called **padding**.

## Visualizing Struct Padding
Let's analyze the memory layout of `UserData` on a 64-bit machine.

- `IsActive` (bool): 1 byte. Alignment requirement: 1 byte.
- `Score` (float64): 8 bytes. Alignment requirement: 8 bytes.
- `Level` (int16): 2 bytes. Alignment requirement: 2 bytes.

```text
Memory Layout of Unoptimized UserData struct:
+-------+-------+-------+-------+-------+-------+-------+-------+
| Offset| 0     | 1     | 2     | 3     | 4     | 5     | 6     | 7     |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+
| 0x00  | IsAct | PADD  | PADD  | PADD  | PADD  | PADD  | PADD  | PADD  |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+
| 0x08  |                        Score (float64)                        |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+
| 0x10  |      Level    | PADD  | PADD  | PADD  | PADD  | PADD  | PADD  |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+
```

1.  `IsActive` occupies offset 0.
2.  `Score` needs to start at a multiple of 8. The next available slot is offset 1. However, 1 is not a multiple of 8. The compiler pads offsets 1 through 7 (7 wasted bytes). `Score` is placed at offset 8.
3.  `Level` needs a multiple of 2. Offset 16 is a multiple of 2, so it fits perfectly.
4.  **Trailing Padding:** An array of `UserData` must ensure that every element's `Score` aligns to 8 bytes. Therefore, the total struct size must be a multiple of its largest alignment requirement (8). The compiler adds 6 bytes of trailing padding, bringing the total size to 24 bytes.

## The Solution: Struct Field Reordering
To eliminate wasted memory, we simply reorder the struct fields from largest alignment requirement to smallest.

```go
type UserDataOptimized struct {
	Score    float64 // 8 bytes
	Level    int16   // 2 bytes
	IsActive bool    // 1 byte
}
```

### Optimized Memory Layout
```text
Memory Layout of Optimized UserDataOptimized struct:
+-------+-------+-------+-------+-------+-------+-------+-------+
| Offset| 0     | 1     | 2     | 3     | 4     | 5     | 6     | 7     |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+
| 0x00  |                        Score (float64)                        |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+
| 0x08  |     Level     | IsAct | PADD  | PADD  | PADD  | PADD  | PADD  |
+-------+-------+-------+-------+-------+-------+-------+-------+-------+
```

1. `Score` is placed at offset 0.
2. `Level` is placed at offset 8.
3. `IsActive` is placed at offset 10.
4. **Trailing Padding:** The largest alignment is 8. The struct currently occupies 11 bytes. The compiler adds 5 bytes of padding to round up to 16 bytes.

By merely reordering the fields, we reduced the struct size from 24 bytes to 16 bytes—a 33% memory footprint reduction, which directly translates to significantly less Garbage Collection pressure and better L1 CPU cache utilization in highly concurrent systems.
