# Python Dunder Methods: Customizing Object Collection, Representation, and Context Protocols

## The Problem: The Overhead of Un-Pythonic APIs
A data engineering team develops a real-time sliding window analytics engine in Python. The engine represents windowed time-series data using custom objects. Initially, developers manipulate these series using classical Java-style accessor methods:

```python
series.add_element(datapoint)
value = series.get_element_at_index(5)
window_length = series.compute_length()
```

While functional, this approach is verbose, unreadable, and creates high cognitive overhead. It prevents developers from utilizing standard Python paradigms, such as slice notation (`series[10:50]`), built-in length checks (`len(series)`), standard for-loop iteration (`for x in series`), and context-managed execution bounds (`with series as s:`). 

Furthermore, standard representation tools (like logging the series or debugging it in an IDE) display useless memory pointers (`<TimeSeries object at 0x7f81>`) instead of clean data schemas. 

To resolve this, we must leverage the Python Data Model to bind our custom types directly to Python's native syntactic constructs.

---

## Technical Architecture: Python's Data Model
Python's core syntax is designed around **duck typing** and **special methods** (commonly referred to as "dunder" or double-underscore methods). The Python interpreter translates high-level syntactic syntax directly into specific magic method calls on target objects.

```
       PYTHON SOURCE CODE                            INTERPRETER TRANSLATION
+------------------------------+             +-------------------------------------+
|  len(my_object)              |  ---------> |  type(my_object).__len__(my_object) |
|  my_object[0:10]             |  ---------> |  my_object.__getitem__(slice(0, 10))|
|  with my_object as b:        |  ---------> |  __enter__() / __exit__()           |
+------------------------------+             +-------------------------------------+
                                                                |
                                                                v
                                             +-------------------------------------+
                                             |  Executes object's internal logic    |
                                             +-------------------------------------+
```

### 1. The Collection Protocol (`__len__`, `__getitem__`, `__setitem__`)
When `len(obj)` is called, CPython queries a C-level field in the object’s structure for performance. If unavailable, it executes `obj.__len__()`. 
For indexing, `obj[key]` is routed to `obj.__getitem__(key)`. If `key` is a slice (e.g., `1:10:2`), the interpreter passes a native `slice` object.

### 2. The Context Manager Protocol (`__enter__`, `__exit__`)
Context managers provide safe lifecycle barriers for system resources. The expression `with obj as target:` immediately executes `obj.__enter__()`, binding its return value to `target`. 
When execution exits the block, Python guarantees invocation of `obj.__exit__(exc_type, exc_val, exc_tb)`, passing any active exceptions to allow clean resource release or rollback operations.

---

## Code Implementation: Production-Grade Sliding-Window Series
The following code implements a memory-efficient `SlidingWindowSeries` object. It leverages dunder methods to implement a custom circular buffer, clean string logging, and a transactional context manager.

```python
from typing import Iterator, Union, Any, Tuple

class SlidingWindowSeries:
    """
    A memory-optimized circular buffer representing sliding-window timeseries data.
    """
    def __init__(self, capacity: int):
        self._capacity = capacity
        self._data = [0.0] * capacity
        self._size = 0
        self._head = 0
        self._backup_state = None  # Used for rollback inside context manager

    # --- 1. Collection Protocol ---

    def __len__(self) -> int:
        return self._size

    def __getitem__(self, index: Union[int, slice]) -> Union[float, list[float]]:
        if isinstance(index, slice):
            # Resolve slices relative to our current logical window
            start, stop, step = index.indices(self._size)
            return [self._get_element(i) for i in range(start, stop, step)]
        elif isinstance(index, int):
            if index < 0:
                index += self._size
            if index < 0 or index >= self._size:
                raise IndexError("SlidingWindowSeries index out of bounds")
            return self._get_element(index)
        else:
            raise TypeError("Index must be an integer or slice")

    def __setitem__(self, index: int, value: float) -> None:
        if index < 0:
            index += self._size
        if index < 0 or index >= self._size:
            raise IndexError("SlidingWindowSeries index out of bounds")
        physical_index = (self._head + index) % self._capacity
        self._data[physical_index] = float(value)

    def __iter__(self) -> Iterator[float]:
        for i in range(self._size):
            yield self._get_element(i)

    def append(self, value: float) -> None:
        """Appends an element to the circular buffer."""
        if self._size < self._capacity:
            physical_index = (self._head + self._size) % self._capacity
            self._data[physical_index] = float(value)
            self._size += 1
        else:
            # Overwrite head (slide the window forward)
            self._data[self._head] = float(value)
            self._head = (self._head + 1) % self._capacity

    def _get_element(self, logical_index: int) -> float:
        physical_index = (self._head + logical_index) % self._capacity
        return self._data[physical_index]

    # --- 2. Representation Protocol ---

    def __repr__(self) -> str:
        # Programmer-facing detailed representation
        elements = [self._get_element(i) for i in range(self._size)]
        return f"SlidingWindowSeries(capacity={self._capacity}, size={self._size}, data={elements})"

    def __str__(self) -> str:
        # Human-readable representation
        return f"<Series: Size {self._size}/{self._capacity}>"

    # --- 3. Context Manager Protocol (Transactional Rollback) ---

    def __enter__(self) -> "SlidingWindowSeries":
        # Create a deep snapshot of current state to allow rollbacks on failure
        self._backup_state = (list(self._data), self._size, self._head)
        return self

    def __exit__(self, exc_type: Any, exc_val: Any, exc_tb: Any) -> bool:
        if exc_type is not None:
            # An error occurred inside the 'with' block; roll back to snapshot
            self._data, self._size, self._head = self._backup_state
            print(f"[Rollback Activated] Restored state due to exception: {exc_val}")
            self._backup_state = None
            return False  # Do not silence the exception
        
        self._backup_state = None
        return True


# --- Verification and Execution ---
if __name__ == "__main__":
    series = SlidingWindowSeries(capacity=5)
    
    # Append values
    for val in [10.5, 20.0, 30.2, 40.1, 50.8]:
        series.append(val)
    
    print("Logical Length:", len(series))
    print("Full representation:", repr(series))
    print("Slice [1:4]:", series[1:4])

    # Slide the window forward by adding another value
    series.append(60.9)
    print("After sliding (head moved):", repr(series))

    # Demonstrate context-managed atomic operations
    try:
        with series as atomic_series:
            atomic_series[0] = 999.9
            atomic_series[1] = 888.8
            print("Modified series state inside transaction:", repr(atomic_series))
            # Trigger artificial error
            raise ValueError("Database transaction failure during telemetry flush")
    except ValueError:
        pass

    print("Post-failure rollback verification:", repr(series))
```

---

## Solving the Problem: Performance and Typing Rules

### Rule 1: Always Implement `__slots__` Alongside Custom Protocols
If you instantiate millions of elements containing custom protocols, the object metadata overhead can degrade system memory. Add `__slots__ = ("_capacity", "_data", "_size", "_head", "_backup_state")` to bypass Python's dynamic object dictionary allocator and reduce memory consumption.

### Rule 2: Explicitly Inherit from typing.Collection Protocols
To let static analysis tools and IDEs compile checks correctly, inherit from abstract base collections:
```python
from collections.abc import Collection

class SlidingWindowSeries(Collection):
    # This guarantees static analysis tools verify len(), iter(), and item properties
```

### Rule 3: Use `__repr__` for Log Ingestion
Ensure `__repr__` yields executable-like declarations or clean, serializable JSON formats. This permits structured logging pipelines (such as Elastic or Datadog) to parse your exceptions and debug prints without needing custom regex extraction modules.
