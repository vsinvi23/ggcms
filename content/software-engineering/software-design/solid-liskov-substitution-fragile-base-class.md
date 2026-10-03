---
title: "Diagnosing and Fixing Fragile Base Class Hierarchies (LSP)"
description: "How to spot Liskov Substitution violations from instanceof checks and UnsupportedOperationException, and how to refactor them into composable interfaces with a TypeScript document-processing example."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "DEEP_DIVE"
tags:
  - "solid-principles"
  - "liskov-substitution"
  - "typescript"
  - "composition-over-inheritance"
  - "interface-segregation"
  - "fragile-base-class"
---

# Diagnosing and Fixing Fragile Base Class Hierarchies (LSP)

## The Problem: The Inheritance Reuse Trap

Inheritance is one of the most overused mechanisms in object-oriented design. Developers frequently subclass existing components simply to reuse a few lines of code. This practice often leads directly to violations of the **Liskov Substitution Principle (LSP)** — the "L" in SOLID.

LSP states that objects of a superclass must be completely replaceable with objects of its subclasses without altering the correctness of the program. When a subclass violates this rule, it introduces unexpected behaviors that break client code.

A classic symptom of an LSP violation is when a subclass overrides a superclass method and throws an `UnsupportedOperationException`, or forces the client to perform type casting (`instanceof` checks) to handle the subclass uniquely.

```text
                    +------------------------------------+
                    |             Base: Bird             |
                    |------------------------------------|
                    | + fly(speed: number): void         |
                    +------------------------------------+
                                      ^
                                      | (Inherits)
                    +------------------------------------+
                    |          Subclass: Ostrich         |
                    |------------------------------------|
                    | + fly(speed: number): void         | ---> THROWS "CantFlyError"!
                    +------------------------------------+
```

When client code iterates over a collection of `Bird` objects and calls `fly()`, it suddenly crashes because of the `Ostrich`. The client is forced to write defensive, fragile code:

```typescript
// Anti-pattern: Client forced to check concrete types
for (const bird of birds) {
  if (!(bird instanceof Ostrich)) {
    bird.fly(20);
  }
}
```

This violates the open-closed principle, compromises polymorphism, and results in a highly fragile codebase where base class changes cause unpredictable failures downstream.

## The Mental Model: Contractual Behavior over Class Signatures

To avoid this, we must shift our mental model from **Signature Compatibility** (the code compiles because types match) to **Behavioral Contract Compatibility**.

An interface or superclass defines a **contract** that guarantees:

1. **Preconditions**: What the method expects to be true before execution. Subclasses cannot strengthen preconditions (e.g., accepting fewer inputs).
2. **Postconditions**: What the method guarantees will be true after execution. Subclasses cannot weaken postconditions (e.g., returning a wider, looser set of values).
3. **Invariants**: What must remain true throughout.

If a subclass cannot honor the exact behavioral contracts of its parent, inheritance is the wrong abstraction. We must refactor using **Composition over Inheritance** or **Interface Segregation**.

## Refactoring the Violation to Interface Composition

Below is a TypeScript implementation of a system managing document processing. We begin with a violating inheritance tree and refactor it into clean, composable interfaces.

### The LSP Violation (Anti-Pattern)

```typescript
class DocumentFile {
  constructor(public title: string, public content: string) {}

  public save(): void {
    console.log(`Saving document ${this.title} to disk.`);
  }
}

// ReadOnlyDocument inherits Document but cannot support save operations!
class ReadOnlyDocument extends DocumentFile {
  public override save(): void {
    // VIOLATION: We have broken the superclass contract by throwing an error.
    throw new Error('Failure: Cannot write to a read-only document!');
  }
}
```

### The LSP-Compliant Solution (Composition and Interface Segregation)

To fix this, we split the capabilities into smaller, segregated interfaces. Read-only files only implement reading capabilities, while writable files compose both reading and writing interfaces.

```typescript
// 1. Segregate Interfaces
interface Readable {
  getTitle(): string;
  getContent(): string;
}

interface Writable {
  save(): void;
}

// 2. Implement focused classes
export class ReadOnlyDoc implements Readable {
  constructor(private title: string, private content: string) {}

  public getTitle() { return this.title; }
  public getContent() { return this.content; }
}

export class WritableDoc implements Readable, Writable {
  constructor(private title: string, private content: string) {}

  public getTitle() { return this.title; }
  public getContent() { return this.content; }

  public save(): void {
    console.log(`Writing changes of ${this.title} to disk.`);
  }
}

// 3. Client processes items polymorphism-safely
export class DocumentService {
  // Client only expects readable documents, completely safe for both types
  public displayMetadata(docs: Readable[]): void {
    for (const doc of docs) {
      console.log(`Document: ${doc.getTitle()}`);
    }
  }

  // Client explicitly expects writable documents, eliminating runtime exceptions
  public persistDocuments(docs: Writable[]): void {
    for (const doc of docs) {
      doc.save();
    }
  }
}
```

## Architectural Guardrails and Trade-offs

1. **Boilerplate Overhead**: Refactoring to smaller interfaces and composition can slightly increase class counts and delegation boilerplate. However, this is heavily offset by a highly testable and robust domain model.
2. **Design Discipline**: Teams must perform routine code reviews to ensure new features are designed around behaviors (`Readable`, `Writable`) rather than physical structures (`DocumentFile`).
