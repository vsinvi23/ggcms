# std::vector Explained Internally: Contiguous Memory Arrays

## Problem Statement
Software routinely needs arrays that can grow at runtime. C-style dynamic arrays require manual reallocation and data copying, leading to memory leaks, dangling pointers, and constant overhead. We need a structure that dynamically manages its capacity while preserving O(1) random access and excellent CPU cache locality.

## Architectural Solution: The 3-Pointer Model
`std::vector` is a dynamically resizing contiguous array. It encapsulates its memory state using exactly three pointers (or equivalent size/capacity integers):
1. **`begin_`**: Points to the start of the allocated memory.
2. **`end_`**: Points to one past the last constructed element.
3. **`capacity_`**: Points to one past the end of the allocated memory block.

When `end_ == capacity_`, the vector is full. On the next insertion, it allocates a larger memory block, moves elements, and destroys the old block.

### Memory Layout

```text
[   begin_   ]                            [    end_    ]        [  capacity_ ]
      |                                        |                       |
      v                                        v                       v
      +--------+--------+--------+--------+----+----+----+----+----+---+
Heap: | Obj[0] | Obj[1] | Obj[2] | Obj[3] | uninitialized memory       |
      +--------+--------+--------+--------+----+----+----+----+----+---+
```

## Robust Code Example

Here is a simplified, non-templated look at how `push_back` and reallocation operate internally.

```cpp
#include <iostream>
#include <utility>
#include <memory>

class IntVector {
    int* begin_ = nullptr;
    int* end_ = nullptr;
    int* capacity_ = nullptr;

    void reallocate(size_t new_capacity) {
        // Allocate raw memory
        int* new_block = static_cast<int*>(::operator new(new_capacity * sizeof(int)));
        
        size_t size = end_ - begin_;
        // Move old elements to new block
        for (size_t i = 0; i < size; ++i) {
            new (&new_block[i]) int(std::move(begin_[i]));
        }
        
        // Deallocate old block
        ::operator delete(begin_);
        
        begin_ = new_block;
        end_ = new_block + size;
        capacity_ = new_block + new_capacity;
    }

public:
    void push_back(int value) {
        if (end_ == capacity_) {
            size_t current_cap = capacity_ - begin_;
            size_t new_cap = (current_cap == 0) ? 1 : current_cap * 2;
            reallocate(new_cap);
        }
        new (end_) int(value); // Placement new
        ++end_;
    }

    size_t size() const { return end_ - begin_; }
    size_t capacity() const { return capacity_ - begin_; }
};

int main() {
    IntVector vec;
    for(int i = 0; i < 5; ++i) vec.push_back(i);
    std::cout << "Size: " << vec.size() << ", Cap: " << vec.capacity() << "\n";
    return 0;
}
```

## Under the Hood: Mechanics

### Amortized O(1) Growth
Vectors typically grow by a geometric factor—usually `1.5x` (MSVC) or `2x` (GCC/Clang). This guarantees that the average time complexity of `push_back` remains O(1). If it grew by a constant amount (e.g., +10 elements), every insertion would average O(N) due to constant reallocation.

### std::move_if_noexcept
When a vector reallocates, it must transfer elements. If the element's move constructor might throw an exception, moving elements halfway through could leave the vector in a corrupted, unrecoverable state. `std::vector` uses `std::move_if_noexcept`—if your class does not mark its move constructor as `noexcept`, `std::vector` will quietly fall back to **copying** elements during reallocation, absolutely tanking performance.

### Cache Locality
`std::vector` is the default container in C++ because hardware prefetchers easily predict linear memory access. Processing elements in a vector is orders of magnitude faster than a Linked List due to L1/L2 CPU cache lines loading memory blocks sequentially.