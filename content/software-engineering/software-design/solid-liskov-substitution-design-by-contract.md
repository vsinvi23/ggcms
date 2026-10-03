---
title: "The Liskov Substitution Principle: Preventing Fragile Inheritance Trees"
description: "Understanding Liskov Substitution through Design by Contract — preconditions and postconditions — with the classic Rectangle/Square and Bird/Penguin violations resolved via interfaces in C#."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "solid-principles"
  - "liskov-substitution"
  - "design-by-contract"
  - "csharp"
  - "inheritance"
  - "polymorphism"
---

# The Liskov Substitution Principle: Preventing Fragile Inheritance Trees

## The Problem: The Inheritance Trap

Inheritance is one of the pillars of Object-Oriented Programming (OOP), but it is frequently abused. Developers often use inheritance merely to share code, ignoring the semantic relationship between the classes. This results in fragile systems where swapping a base class for a subclass causes runtime crashes or subtle logical errors.

The **Liskov Substitution Principle (LSP)**, formulated by Barbara Liskov in 1987, addresses this directly. It states:

> *If S is a subtype of T, then objects of type T may be replaced with objects of type S without altering any of the desirable properties of the program (correctness, task performed, etc.).*

In plain English: a subclass must behave like its parent class. If you pass a subclass into a function that expects the parent class, the function must not break.

## The Mental Model: Design by Contract

To understand LSP, you must understand "Design by Contract." Every class establishes a contract with its callers.

1. **Preconditions**: What must be true before a method is called (e.g., "Parameter X cannot be null").
2. **Postconditions**: What the method guarantees to be true after it executes (e.g., "Returns an integer > 0").

LSP establishes two strict rules for subclasses overriding parent methods:

1. **You cannot strengthen preconditions.** (A subclass cannot demand *more* from the caller than the parent did).
2. **You cannot weaken postconditions.** (A subclass cannot deliver *less* than the parent promised).

### The Classic Violation: Rectangle and Square

The most famous violation of LSP occurs in geometry. In mathematics, a Square is a Rectangle. In OOP, mapping this relationship via inheritance is a disaster.

```csharp
public class Rectangle
{
    public virtual int Width { get; set; }
    public virtual int Height { get; set; }

    public int Area => Width * Height;
}

public class Square : Rectangle
{
    // A square must maintain equal width and height!
    public override int Width
    {
        set { base.Width = value; base.Height = value; }
    }
    public override int Height
    {
        set { base.Width = value; base.Height = value; }
    }
}
```

Now, let's write a function that relies on the parent `Rectangle` contract.

```csharp
public void ResizeRectangle(Rectangle rect)
{
    rect.Width = 5;
    rect.Height = 10;

    // The contract of a Rectangle implies Area = Width * Height
    // We expect the area to be 50.
    if (rect.Area != 50) {
        throw new Exception("LSP Violated!");
    }
}
```

If we pass a `Square` into `ResizeRectangle`, it throws an exception. Setting the `Height` to 10 dynamically changes the `Width` to 10. The area becomes 100. The subclass (`Square`) violated the postcondition implicit in the `Rectangle` class: that modifying the height does not affect the width.

## The Solution: Refactoring for LSP

When you encounter an LSP violation, it usually means your abstraction is wrong. Inheritance (`IS-A`) was used where composition (`HAS-A`) or a separate interface would have been better.

Instead of forcing a Square to be a Rectangle, extract the shared behavior into an interface that defines only what both shapes guarantee.

```csharp
public interface IShape
{
    int CalculateArea();
}

public class Rectangle : IShape
{
    public int Width { get; set; }
    public int Height { get; set; }
    public int CalculateArea() => Width * Height;
}

public class Square : IShape
{
    public int SideLength { get; set; }
    public int CalculateArea() => SideLength * SideLength;
}
```

Now, functions can operate on `IShape` without making assumptions about independent widths or heights:

```csharp
public void PrintArea(IShape shape)
{
    Console.WriteLine($"Area is: {shape.CalculateArea()}");
}
```

## Another Common Violation: `NotImplementedException`

If you ever see a subclass that throws a `NotImplementedException` or `NotSupportedException` for a method defined in its base class, **LSP is being violated**.

```csharp
public class Bird {
    public virtual void Fly() { /* ... */ }
}

public class Penguin : Bird {
    public override void Fly() {
        throw new NotSupportedException("Penguins cannot fly");
    }
}
```

A caller expecting a `Bird` will crash if handed a `Penguin`. The abstraction is flawed; not all birds can fly. The solution is to separate the interfaces (e.g., `IFlyingBird`).

## Summary

The Liskov Substitution Principle forces developers to think deeply about behavioral contracts rather than just data structure. By ensuring that subclasses seamlessly substitute their parents, you create modular, robust systems where polymorphism works safely, and polymorphic code doesn't become littered with `if (obj is SubType)` type-checking hacks.
