---
title: "Python Dunder Methods: Collections and the Context Manager Protocol"
description: "How to implement the collection protocol (__len__, __getitem__, __iter__) and the context manager protocol (__enter__, __exit__) to build a transaction log class with automatic rollback on error."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "python"
  - "dunder-methods"
  - "context-manager"
  - "oop"
  - "data-model"
---

# Python Dunder Methods: Collections and the Context Manager Protocol

## The Problem: The Un-Pythonic Object

In Python, building custom business domain models often leads to clunky, un-intuitive code interfaces. For example, if you create a custom `TransactionHistory` collection class, developers are forced to write verbose, custom method calls like `history.get_transaction_by_index(0)`, `len(history.items)`, or manage transaction state cleanups using manual `try...finally` resource management blocks.

This makes your class feel like a second-class citizen when compared to native Python containers like lists or dictionaries. Python's power lies in its **Data Model**, which uses "Dunder" (Double Underscore) methods to define protocols. By implementing these hooks, we can integrate any custom class into the Python language runtime natively, enabling the use of built-in syntax like `len()`, `for item in x`, `obj[i]`, and `with open()`.

## Architectural Mechanics: How Python Dispatches Dunder Methods

Python uses "duck typing" combined with explicit protocol mapping. When you invoke built-in syntax, the Python interpreter translates the request into an underlying dunder call on the target object.

```text
       Python Source Code                           Python Interpreter Dispatch
+-------------------------------+                  +-------------------------------+
| len(my_object)                |  ------------->  | my_object.__len__()            |
|                                |                  |                                 |
| for x in my_object:           |  ------------->  | iter(my_object) -> __iter__()  |
|                                |                  |                                 |
| my_object[2]                  |  ------------->  | my_object.__getitem__(2)       |
|                                |                  |                                 |
| with my_object as o:          |  ------------->  | my_object.__enter__()          |
|   # inside block              |                  |   (on block exit)              |
|                                |                  | my_object.__exit__(...)        |
+-------------------------------+                  +-------------------------------+
```

### The Three Pillars of Object Customization

1. **The Collection / Sequence Protocol:**
   - `__len__(self)`: Invoked by the `len()` built-in. Must return a non-negative integer.
   - `__getitem__(self, key)`: Enables index-based lookup (`obj[key]`) and supports slice objects.
   - `__iter__(self)`: Returns an iterator object, enabling loop iteration and comprehension syntax.

2. **The Representation Protocol:**
   - `__repr__(self)`: Returns an unambiguous string representation of the object. Ideally, it should look like a valid Python expression to recreate the object, making it invaluable for debugging.
   - `__str__(self)`: Returns a human-friendly string representation, invoked by `print()` and `str()`.

3. **The Context Manager Protocol:**
   - `__enter__(self)`: Prepares the runtime context (e.g., locks a thread or opens a socket). Returns the resource.
   - `__exit__(self, exc_type, exc_val, exc_tb)`: Executes teardown actions (e.g., releases locks, commits database changes). Handles errors raised inside the block.

## Code Study: A Transaction Logger and Rollback Context Manager

The following Python program implements a robust `TransactionLog` collection class. It integrates indexing, iteration, representations, and transactional rollbacks via a context manager.

```python
from typing import Dict, Any, List

class Transaction:
    def __init__(self, tx_id: int, amount: float, status: str = "PENDING"):
        self.tx_id = tx_id
        self.amount = amount
        self.status = status

    # Representation Protocol
    def __repr__(self) -> str:
        return f"Transaction(tx_id={self.tx_id}, amount={self.amount}, status='{self.status}')"

    def __str__(self) -> str:
        return f"TX #{self.tx_id}: ${self.amount:.2f} [{self.status}]"


class TransactionLog:
    def __init__(self, account_holder: str):
        self.account_holder = account_holder
        self.records: List[Transaction] = []
        self._backup_records: List[Transaction] = []

    # Collection Protocol
    def __len__(self) -> int:
        return len(self.records)

    def __getitem__(self, index: Any) -> Any:
        # Supports indexing (log[0]) and slicing (log[1:3])
        if isinstance(index, (int, slice)):
            return self.records[index]
        raise TypeError(f"Invalid index type: {type(index).__name__}")

    def __iter__(self):
        # Returns an iterator over records
        return iter(self.records)

    # Representation Protocol
    def __repr__(self) -> str:
        return f"TransactionLog(account_holder='{self.account_holder}', size={len(self.records)})"

    # Context Manager Protocol (Acid Transaction Rollback)
    def __enter__(self):
        # Create deep copy backup of current state
        self._backup_records = [
            Transaction(t.tx_id, t.amount, t.status) for t in self.records
        ]
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        if exc_type is not None:
            # An exception occurred inside the block: ROLLBACK STATE!
            print(f"Error detected ({exc_val}). Rolling back transaction records...")
            self.records = self._backup_records
        else:
            # Success: Commit modifications by cleaning up backup
            print("Transactions committed successfully.")
            for tx in self.records:
                if tx.status == "PENDING":
                    tx.status = "COMMITTED"
        self._backup_records.clear()
        # Return False to let the exception propagate, or True to suppress it
        return False


# --- Verification execution ---
if __name__ == "__main__":
    log = TransactionLog(account_holder="Alice Smith")
    log.records.append(Transaction(101, 150.50))
    log.records.append(Transaction(102, 300.00))

    print("--- 1. Testing Representation and Collection Protocols ---")
    print(repr(log))
    print(f"Log size: {len(log)}")
    print(f"First element: {log[0]}")

    print("\n--- 2. Testing Context Protocol - Success Path ---")
    with log as active_log:
        active_log.records.append(Transaction(103, 450.00))
        # Iterate over records seamlessly
        for tx in active_log:
            print(f"  Looping: {tx}")

    print(f"Log size after successful commit: {len(log)}")
    print(f"Latest status: {log[-1]}")

    print("\n--- 3. Testing Context Protocol - Rollback on Error Path ---")
    try:
        with log as active_log:
            active_log.records.append(Transaction(104, 9999.00))
            print(f"  Attempting risky size: {len(active_log)}")
            # Force an unexpected runtime error
            raise ValueError("Insufficient funds credit limit breach!")
    except ValueError as e:
        print(f"  Caught expected error: {e}")

    print(f"Log size after failed rollback: {len(log)}")
    for tx in log:
        print(f"  Current active: {tx}")
```

Implementing dunder protocols ensures your code behaves exactly like standard library objects, making API integration elegant, intuitive, and safe under error-prone environments.
