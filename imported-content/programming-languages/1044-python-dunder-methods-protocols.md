# Python Dunder Methods: Customizing Object Collection, Representation, and Context Protocols

## The Problem: The Magic of Built-in Functions
In Python, you can calculate the length of a list using `len(my_list)`, add two strings with `"a" + "b"`, or iterate over a dictionary with a `for` loop. But what happens when you define a custom class? 

```python
class ShoppingCart:
    def __init__(self):
        self.items = []

cart = ShoppingCart()
# len(cart) -> TypeError: object of type 'ShoppingCart' has no len()
# for item in cart: -> TypeError: 'ShoppingCart' object is not iterable
```
By default, custom objects are opaque to Python's built-in syntax. To make custom objects behave like native data types, Python employs a system of protocols.

## The Architectural Solution: Dunder Methods (Protocols)
Python achieves polymorphism through "duck typing" and a rigorous set of protocols. A protocol is an informal interface defined by specific double-underscore (dunder) methods. 

When you invoke a built-in function or syntactic sugar, the Python interpreter dynamically translates it into a call to the corresponding dunder method on the object.

### Syntactic Translation Map
```text
Syntax/Function         ->   Underlying Dunder Method
-----------------------------------------------------
len(obj)                ->   obj.__len__()
obj[key]                ->   obj.__getitem__(key)
for item in obj:        ->   iter(obj) -> obj.__iter__()
obj1 + obj2             ->   obj1.__add__(obj2)
with obj:               ->   obj.__enter__(), obj.__exit__()
str(obj)                ->   obj.__str__()
```

## Implementing the Collection Protocol
To make our `ShoppingCart` behave like a native collection, we must implement the Sequence protocol, which primarily involves `__len__` and `__getitem__`.

```python
class ShoppingCart:
    def __init__(self):
        self.items = []
        
    def add(self, item):
        self.items.append(item)

    # Defines behavior for len()
    def __len__(self):
        return len(self.items)

    # Defines behavior for indexing: cart[0]
    # Also inherently enables basic 'for' loop iteration!
    def __getitem__(self, index):
        return self.items[index]

cart = ShoppingCart()
cart.add("Apple")
cart.add("Banana")

print(len(cart))       # Outputs: 2
print(cart[1])         # Outputs: "Banana"

# Python's fallback iteration mechanism utilizes __getitem__ 
# starting from index 0 until IndexError is raised.
for item in cart:
    print(item)        # Outputs: Apple \n Banana
```

## The Representation Protocol: `__str__` vs `__repr__`
Python distinguishes between two types of string representations: human-readable and developer-centric.

1.  **`__str__`**: Called by `str()` and `print()`. It should return a clean, user-friendly description.
2.  **`__repr__`**: Called by `repr()` and the interactive REPL. It should return a string that ideally contains valid Python code to recreate the object.

```python
class Point:
    def __init__(self, x, y):
        self.x = x
        self.y = y

    def __str__(self):
        return f"({self.x}, {self.y})"

    def __repr__(self):
        return f"Point(x={self.x}, y={self.y})"

p = Point(3, 4)
print(p)       # Calls p.__str__()  -> (3, 4)
print(repr(p)) # Calls p.__repr__() -> Point(x=3, y=4)
```

## The Context Manager Protocol
Resource management (closing files, releasing locks, closing database connections) is error-prone. The `with` statement guarantees cleanup, even if exceptions occur. An object supports the `with` statement by implementing the Context Manager protocol: `__enter__` and `__exit__`.

```python
import time

class Timer:
    def __init__(self, description):
        self.description = description
        
    # Called when the 'with' block begins
    def __enter__(self):
        self.start = time.perf_counter()
        return self # Bound to the 'as' variable

    # Called when the 'with' block ends, regardless of exceptions
    def __exit__(self, exc_type, exc_val, traceback):
        elapsed = time.perf_counter() - self.start
        print(f"[{self.description}] executed in {elapsed:.4f} seconds")
        
        # If an exception occurred, we could suppress it by returning True
        return False 

# Usage:
with Timer("Heavy Computation") as t:
    # Do some work
    sum(i * i for i in range(10_000_000))

# Output: [Heavy Computation] executed in 0.7421 seconds
```

By hooking into these architectural protocols, developers can construct domain-specific objects that seamlessly integrate with Python's core syntax, yielding highly expressive and idiomatic APIs.
