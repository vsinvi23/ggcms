# Function Pointers Explained

## The Problem
C is a procedural language without native support for Object-Oriented polymorphism (interfaces, virtual methods) or dynamic dispatch. When you need a system that can swap out behavior at runtime—like a plugin architecture, state machine, or callback system—hardcoding `if/else` or `switch` statements becomes a maintenance nightmare.

Function pointers solve this by allowing you to store the memory address of a function in a variable, enabling dynamic execution of code.

## Technical Architecture

In memory, compiled C functions are just blocks of machine instructions residing in the Text segment. A function pointer simply holds the address of the first instruction.

```text
      Text Segment
      
[ Address 0x400100 ] <--- add_numbers()
  push %rbp
  mov %rsp, %rbp
  add %edi, %esi
  ...

[ Address 0x400200 ] <--- sub_numbers()
  push %rbp
  mov %rsp, %rbp
  sub %esi, %edi
  ...

Function Pointer `operation`:
+------------------+
| Value: 0x400100  | -----> Executes `add_numbers` when called.
+------------------+
```

## Robust Code Example

### The Solution: Callback Architecture and Polymorphism
Here is how to implement a basic dynamic dispatch system (similar to C++ virtual tables) in pure C.

```c
#include <stdio.h>

// 1. Define the function pointer type for clarity
// "math_op" is a pointer to a function taking two ints and returning an int.
typedef int (*math_op)(int, int);

// 2. Concrete implementations
int add(int a, int b) { return a + b; }
int subtract(int a, int b) { return a - b; }
int multiply(int a, int b) { return a * b; }

// 3. A struct utilizing function pointers (Simulating an Interface)
typedef struct {
    const char* name;
    math_op execute; // The function pointer
} Calculator;

// 4. A function that takes a callback
void process_data(int x, int y, math_op callback) {
    int result = callback(x, y);
    printf("Callback result: %d\n", result);
}

int main() {
    // Array of "Objects" with different behaviors
    Calculator calcs[] = {
        {"Adder", add},
        {"Subtractor", subtract},
        {"Multiplier", multiply}
    };

    int x = 10, y = 5;

    // Iterate and execute dynamically
    for (int i = 0; i < 3; i++) {
        printf("%s: %d\n", calcs[i].name, calcs[i].execute(x, y));
    }
    
    // Passing behavior as a callback
    process_data(20, 4, multiply);

    return 0;
}
```