---
title: "Go unsafe.Pointer: Zero-Copy Struct Casting and Manual Pointer Arithmetic"
description: "How to use Go's unsafe package for zero-copy deserialization and offset-based field access, why struct field padding exists, and the GC-tracking hazard around uintptr that makes careless unsafe code dangerous."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "DEEP_DIVE"
tags:
  - "go"
  - "golang"
  - "unsafe-pointer"
  - "memory-layout"
  - "zero-copy"
  - "performance"
  - "garbage-collection"
---

# Go unsafe.Pointer: Zero-Copy Struct Casting and Manual Pointer Arithmetic

## The Problem

Go's type system is built around strict memory safety: clear boundaries between types, no arbitrary pointer arithmetic. In low-latency systems — high-performance database engines, network protocol deserializers, IPC libraries — that safety model introduces real overhead.

Converting raw bytes (`[]byte`) received from a network socket or read from a disk block into a structured Go object normally goes through a deserialization library (`encoding/binary`, or a reflection-based encoder). Those approaches allocate new memory, parse the byte stream field by field, and copy data — heavy GC pressure and wasted CPU cycles on a hot path.

`unsafe.Pointer` lets you skip that: cast a raw byte slice directly onto a Go struct's memory layout, with zero copying.

---

## Struct Memory Layout and Padding

Go structs live in memory as a contiguous block of bytes. The compiler arranges fields according to hardware alignment constraints — typically an 8-byte word on 64-bit systems.

```go
type Header struct {
	Magic    int8   // 1 byte
	Version  int16  // 2 bytes
	Length   int32  // 4 bytes
	Checksum int64  // 8 bytes
}
```

The fields sum to 1 + 2 + 4 + 8 = 15 bytes, but the compiler inserts padding so each field starts at an address that's a multiple of its own size:

```
Address: Offset +0      +1      +2      +3      +4      +5      +6      +7
        ┌───────┬───────┬───────────────┬───────────────────────────────┐
Word 1  │ Magic │Padding│    Version    │            Length             │
        │ (1B)  │ (1B)  │     (2B)      │             (4B)              │
        └───────┴───────┴───────────────┴───────────────────────────────┘
Address: Offset +8                                                      +15
        ┌───────────────────────────────────────────────────────────────┐
Word 2  │                           Checksum                            │
        │                             (8B)                              │
        └───────────────────────────────────────────────────────────────┘
```

`Header` occupies 16 bytes in practice, not 15, because of the single padding byte after `Magic`. Reordering fields largest-to-smallest is a common trick to minimize padding waste.

`unsafe.Pointer` bypasses the type checker entirely: it can be cast to and from any pointer type. Combined with `uintptr` (an integer type large enough to hold any address), it lets you compute and dereference arbitrary offsets.

### The GC Tracking Hazard

`uintptr` is a plain integer — the garbage collector does not treat it as a pointer and will not update it if the object it addresses moves or is collected. If you split a pointer computation across statements, the GC can run *between* them and invalidate the address:

```go
// SAFE: the whole computation is one expression; the GC cannot run between
// taking the address and converting it back to unsafe.Pointer.
p := unsafe.Pointer(uintptr(base) + offset)

// UNSAFE: GC may run between these two lines, moving or freeing the
// object base points into — addr is now a dangling raw integer.
addr := uintptr(base) + offset
p := unsafe.Pointer(addr)
```

---

## Implementation: Zero-Copy Struct Casting and Private-Field Access

```go
package main

import (
	"fmt"
	"reflect"
	"unsafe"
)

// Header represents our protocol packet header.
type Header struct {
	Magic    int8
	Version  int16
	Length   int32
	Checksum int64
}

// SecretVault contains a private field we want to access via pointer offsets.
type SecretVault struct {
	publicID  int32
	secretKey int64 // unexported/private field
}

func main() {
	// -------------------------------------------------------------------------
	// Scenario 1: Zero-Copy Deserialization (Byte Slice -> Struct)
	// -------------------------------------------------------------------------

	// Raw buffer matching Header's byte layout.
	// [0]=Magic, [1]=Padding, [2..3]=Version, [4..7]=Length, [8..15]=Checksum
	rawBuffer := []byte{
		0x7F, 0x00, 0xFF, 0x00, 0x0A, 0x00, 0x00, 0x00,
		0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11,
	}

	// 1. Get the slice header of our byte slice
	sliceHeader := (*reflect.SliceHeader)(unsafe.Pointer(&rawBuffer))

	// 2. Cast the Data pointer directly to our Header struct pointer
	headerPtr := (*Header)(unsafe.Pointer(sliceHeader.Data))

	fmt.Println("=== Zero-Copy Struct Cast ===")
	fmt.Printf("Magic:    0x%X\n", headerPtr.Magic)
	fmt.Printf("Version:  %d\n", headerPtr.Version)
	fmt.Printf("Length:   %d\n", headerPtr.Length)
	fmt.Printf("Checksum: 0x%X\n\n", headerPtr.Checksum)

	// -------------------------------------------------------------------------
	// Scenario 2: Accessing Private Fields via Pointer Arithmetic
	// -------------------------------------------------------------------------

	vault := SecretVault{
		publicID:  42,
		secretKey: 9876543210,
	}

	fmt.Println("=== Accessing Private Fields ===")

	// Base pointer of the vault struct
	baseAddr := unsafe.Pointer(&vault)

	// Offset of the private 'secretKey' field
	secretOffset := unsafe.Offsetof(vault.secretKey)
	fmt.Printf("Offset of 'secretKey': %d bytes\n", secretOffset)

	// Pointer arithmetic to point directly at secretKey (single expression!)
	secretKeyPtr := (*int64)(unsafe.Pointer(uintptr(baseAddr) + secretOffset))

	fmt.Printf("Original Secret Value: %d\n", *secretKeyPtr)

	*secretKeyPtr = 1122334455
	fmt.Printf("Modified Secret Value: %d\n", vault.secretKey)
}
```

`reflect.SliceHeader` exposes the same three-field layout (`Data`, `Len`, `Cap`) discussed in slice internals, letting us grab the raw data pointer and reinterpret it as any struct with a matching binary layout — the essence of zero-copy parsing.

---

## Architectural Rules for Production `unsafe` Code

1. **Never cache a `uintptr`.** Keep every `uintptr` conversion and pointer arithmetic step inside a single expression so the GC cannot relocate or free the target memory mid-computation.
2. **Align on word boundaries.** When building custom byte buffers meant for casting, ensure the underlying array is properly aligned (allocated by Go itself, or via correctly aligned cgo memory).
3. **Don't hardcode field offsets.** The compiler does not guarantee struct field ordering/packing is stable across versions unless you control it explicitly. Always compute offsets with `unsafe.Offsetof` rather than hardcoding numeric byte offsets — a compiler upgrade could silently break a hardcoded offset.
