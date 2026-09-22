# Python Dunder Methods: Customizing Object Collection, Representation, and Context Protocols

## The Python Data Model
Python's elegance is largely derived from its consistent data model. Built-in operations like addition (`+`), length checking (`len()`), and iteration (`for x in y`) are not hardcoded parser rules. Instead, they interact with objects via highly formalized protocols, exposed to the developer through double-underscore (dunder or "magic") methods. 

By implementing specific dunder methods, custom classes seamlessly integrate into Python's native ecosystem, behaving indistinguishably from built-in types like lists or dictionaries.

## Representation Protocols: `__str__` vs `__repr__`
Object representation is critical for logging and debugging. Python separates this into two methods:

- `__repr__(self)`: Intended for developers. It should return a string representing a valid Python expression that could recreate the object. 
- `__str__(self)`: Intended for end-users. It should return a readable, descriptive string.

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y
        
    def __repr__(self):
        return f"Point(x={self.x}, y={self.y})"
        
    def __str__(self):
        return f"({self.x}, {self.y})"

p = Point(10, 20)
print(str(p))   # (10, 20)
print(repr(p))  # Point(x=10, y=20)
```
If `__str__` is not defined, Python falls back to calling `__repr__`.

## Collection and Sequence Protocols
To make a custom object behave like a collection (supporting indexing, sizing, and iteration), you must implement the sequence protocol.

1. **`__len__(self)`**: Returns the item count. Hooked by `len()`.
2. **`__getitem__(self, index)`**: Enables indexing `obj[index]`.
3. **`__iter__(self)`**: Returns an iterator object.

Let's build a custom cyclic list that wraps around when out of bounds:

```python
class CyclicBuffer:
    def __init__(self, data):
        self.data = list(data)
        
    def __len__(self):
        return len(self.data)
        
    def __getitem__(self, index):
        # Modulo arithmetic for cyclic behavior
        mapped_index = index % len(self.data)
        return self.data[mapped_index]

buffer = CyclicBuffer([1, 2, 3])
print(len(buffer))    # 3
print(buffer[5])      # 3 (index 5 mapped to index 2)
```

Because `__getitem__` is implemented, Python automatically allows iterating over `CyclicBuffer` without an explicit `__iter__` method, dynamically passing incrementing integers until an `IndexError` is raised.

## Context Management Protocols
Resource management (files, network connections, database locks) requires strict setup and teardown logic. Python's `with` statement utilizes the Context Manager protocol via `__enter__` and `__exit__`.

```ascii
[ Execution Flow of `with obj:` ]
      |
      +--> obj.__enter__()
      |       (Setup resource)
      |
      +--> [ Inner Code Block ]
      |       (Use resource)
      |
      +--> obj.__exit__(exc_type, exc_val, traceback)
              (Teardown resource, handle exceptions)
```

```python
class DatabaseConnection:
    def __init__(self, dsn):
        self.dsn = dsn
        
    def __enter__(self):
        print(f"Connecting to {self.dsn}")
        self.connected = True
        return self # Bound to the 'as' variable
        
    def __exit__(self, exc_type, exc_val, traceback):
        print("Closing connection")
        self.connected = False
        if exc_type is not None:
            print(f"Exception handled: {exc_val}")
        return True # Suppress the exception

with DatabaseConnection("postgres://localhost") as db:
    raise ValueError("Simulation crash")
```
Even though the inner block raises an exception, `__exit__` is guaranteed to run, ensuring the connection closes cleanly. Returning `True` from `__exit__` suppresses the exception entirely.

## Conclusion
Dunder methods are not hacks; they are the defined interfaces of the Python language. By adopting these protocols, your custom classes stop acting like passive data containers and start behaving like first-class native Python objects, ensuring cleaner, more idiomatic codebases.
