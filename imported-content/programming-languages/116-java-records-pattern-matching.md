# Java Pattern Matching: Exhaustive Switches over Sealed Records

## The Problem: The Boilerplate of Polymorphism
For decades, object-oriented programming in Java relied on the Visitor pattern or cumbersome `instanceof` checks to execute logic based on the specific subtype of an object. 

Imagine a system that processes different types of mathematical expressions. Historically, you would write code like this:

```java
public interface Expr {}
public class Value implements Expr { public int val; /* constructor, getters */ }
public class Add implements Expr { public Expr left, right; /* constructor, getters */ }

// The old way to evaluate:
public int evaluate(Expr e) {
    if (e instanceof Value) {
        Value v = (Value) e; // Boilerplate cast
        return v.getVal();
    } else if (e instanceof Add) {
        Add a = (Add) e;     // Boilerplate cast
        return evaluate(a.getLeft()) + evaluate(a.getRight());
    }
    throw new IllegalArgumentException("Unknown expression"); // Unsafe!
}
```

This approach has two massive flaws:
1. **Verbosity:** The `instanceof` check followed immediately by a manual cast is pure noise.
2. **Lack of Exhaustiveness:** The compiler cannot verify that you checked all possible implementations of `Expr`. If a new `Multiply` class is added, the compiler won't warn you that `evaluate()` is missing a branch. You will only discover the oversight at runtime when the `IllegalArgumentException` is thrown.

## The Mental Model: Algebraic Data Types (ADTs)
Modern Java has embraced features from functional programming, specifically **Algebraic Data Types (ADTs)** and **Pattern Matching**. 

An ADT is a composite type. It allows you to define a closed universe of data structures. In Java, this is achieved by combining two modern features:
*   **Records:** Transparent, immutable data carriers (Data = Data).
*   **Sealed Classes:** Interfaces or classes that explicitly declare which classes are permitted to implement or extend them.

Together, they allow the compiler to understand exactly what types exist in your domain. When you combine this with `switch` expressions, you get exhaustive pattern matching.

## Building the Domain: Sealed Records
First, let's redefine our expression domain using `sealed` interfaces and `record` classes.

```java
// We explicitly permit ONLY Value and Add to implement this interface.
public sealed interface Expr permits Value, Add {}

// Records automatically generate constructors, getters (val(), left(), right()), 
// equals(), hashCode(), and toString().
public record Value(int val) implements Expr {}
public record Add(Expr left, Expr right) implements Expr {}
```

By sealing the interface, we create a closed hierarchy. The compiler now mathematically proves that an `Expr` can *only* be a `Value` or an `Add`. No other classes can ever implement `Expr` without modifying the `permits` clause.

## Pattern Matching with Switch Expressions
Now, we rewrite our `evaluate` method using Java's enhanced `switch` expressions (introduced in Java 14) and Pattern Matching for switch (Java 21+).

```java
public int evaluate(Expr e) {
    return switch (e) {
        // Pattern match: checks the type and binds the casted value to 'v'
        case Value v -> v.val();
        
        // Pattern match: binds the casted value to 'a'
        case Add a   -> evaluate(a.left()) + evaluate(a.right());
    };
}
```

### Deconstructing the Magic

1. **Type Testing and Binding:** The syntax `case Value v` does two things simultaneously. It checks if `e` is an instance of `Value`. If true, it automatically casts `e` to `Value` and binds it to the variable `v`. No manual casting required.
2. **Switch as an Expression:** Notice the `return switch (e) { ... };`. The `switch` is no longer just a control-flow statement; it is an expression that yields a value. 
3. **Compile-Time Exhaustiveness:** There is no `default` clause here. Why? Because the interface is `sealed`. The Java compiler looks at the `permits` clause of `Expr`, sees that only `Value` and `Add` exist, and verifies that our `switch` covers both cases. 

If a colleague later adds `public record Multiply(Expr left, Expr right) implements Expr {}` and updates the `permits` clause, **the code will fail to compile**. The compiler will point directly to the `evaluate` method and demand that a `case Multiply m` be added. This shifts bug detection from runtime to compile time.

## Record Patterns (Deconstruction)
Java takes this a step further with Record Patterns, allowing you to deconstruct the record directly in the `case` label, extracting its components without even calling the accessor methods.

```java
public int evaluate(Expr e) {
    return switch (e) {
        // Extract 'val' directly from the Value record
        case Value(int val) -> val;
        
        // Extract 'left' and 'right' directly from the Add record
        case Add(Expr left, Expr right) -> evaluate(left) + evaluate(right);
    };
}
```

## Summary
By combining sealed interfaces and records, Java developers can model domains with mathematically closed boundaries. Pattern matching over these structures via `switch` expressions eliminates casting boilerplate and enforces compile-time exhaustiveness checks. This paradigm shift bridges the gap between object-oriented and functional design, resulting in highly readable, exceptionally safe domain logic.
