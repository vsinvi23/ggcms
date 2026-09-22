# Interface Segregation: Designing Single-purpose Interfaces

## The Problem: The "Fat" Interface
The "I" in the SOLID principles stands for the **Interface Segregation Principle (ISP)**. Formulated by Robert C. Martin, ISP states that *no client should be forced to depend on methods it does not use*.

To understand why this matters, look at what happens when we violate it. Often, developers create "fat" or "polluted" interfaces that try to be everything to everyone. Imagine a document management system. You create a generic `IMachine` interface for office equipment.

```typescript
// A violation of the Interface Segregation Principle
interface IMachine {
    print(document: Document): void;
    scan(): Document;
    fax(document: Document): void;
    staple(): void;
}
```

Now, you need to implement a basic, cheap printer. 

```typescript
class BasicPrinter implements IMachine {
    print(document: Document): void {
        console.log("Printing...");
    }

    scan(): Document {
        throw new Error("Scan not supported.");
    }

    fax(document: Document): void {
        throw new Error("Fax not supported.");
    }

    staple(): void {
        throw new Error("Staple not supported.");
    }
}
```

The `BasicPrinter` class is forced to implement `scan`, `fax`, and `staple`—methods it inherently cannot perform. This causes three massive architectural problems:
1. **Fragility:** If the signature of `fax()` changes, `BasicPrinter` must be recompiled and redeployed, even though it doesn't use `fax()`.
2. **Deception:** A developer using `IMachine` expects all implementations to support scanning. When they pass a `BasicPrinter` into a method expecting an `IMachine`, the application crashes at runtime.
3. **Bloat:** Classes become massive files full of `NotImplementedException` stubs.

## The Mental Model: Role-based Interfaces
The mental model for fixing this is **Role-based Interfaces**. Instead of defining interfaces by *what the object is* (a Machine), define interfaces by *what the object can do in a specific context* (a Printer, a Scanner).

Think of interfaces as highly specific job descriptions. If a client needs a document printed, it shouldn't ask for a "Machine." It should ask for a "Printer." 

```text
       [ Client A ]                    [ Client B ]
     Needs to Print                  Needs to Scan
           |                               |
           v                               v
    +-------------+                 +-------------+
    |  IPrinter   |                 |  IScanner   |
    +-------------+                 +-------------+
           ^                               ^
           |                               |
           +---------------+---------------+
                           |
                 +-------------------+
                 | MultiFunctionCopier|
                 +-------------------+
```

## Implementation: Segregating the Interfaces
Let's refactor our TypeScript example to adhere to ISP. We split the "fat" interface into cohesive, single-purpose interfaces.

```typescript
// Segregated, single-purpose interfaces
interface Printer {
    print(document: Document): void;
}

interface Scanner {
    scan(): Document;
}

interface Fax {
    fax(document: Document): void;
}

interface Stapler {
    staple(): void;
}
```

Now, our classes only implement the behaviors they actually support. A class can implement multiple interfaces if it genuinely has those capabilities.

```typescript
// The Basic Printer only implements Printer
class BasicPrinter implements Printer {
    print(document: Document): void {
        console.log("Printing document in black and white...");
    }
}

// The advanced copier implements multiple roles
class MultiFunctionCopier implements Printer, Scanner, Fax {
    print(document: Document): void {
        console.log("Printing in high-res color...");
    }

    scan(): Document {
        console.log("Scanning document...");
        return new Document();
    }

    fax(document: Document): void {
        console.log("Faxing document...");
    }
}
```

### The Client Perspective
Now, look at how this changes the client code. A class that handles a print queue no longer asks for an `IMachine`. It specifically asks for a `Printer`.

```typescript
class PrintSpooler {
    // We only depend on the Printer role. 
    // We don't care if it can fax or scan.
    processQueue(printer: Printer, docs: Document[]) {
        for (const doc of docs) {
            printer.print(doc);
        }
    }
}
```
We can safely pass a `BasicPrinter` or a `MultiFunctionCopier` to `PrintSpooler.processQueue()`. The compiler guarantees that whatever we pass in has a `print()` method, and the client isn't coupled to unused methods.

## Microservices and API Design
ISP isn't just for Object-Oriented Programming; it applies beautifully to API and Microservice design. 

Imagine a REST API endpoint that returns a `User` object. 
- The Mobile App needs `id`, `name`, and `avatarUrl`.
- The Admin Dashboard needs `id`, `name`, `billingHistory`, `loginIPs`, and `permissions`.

If you return a massive "Fat JSON Object" to the Mobile App, you are over-fetching data, wasting bandwidth, and tightly coupling the mobile app to administrative fields it never uses. 

Applying ISP to APIs means creating tailored responses (or using GraphQL) so the client only receives the exact "interface" of data it needs for its specific role.

## Conclusion
The Interface Segregation Principle keeps systems decoupled and flexible. By designing narrow, single-purpose interfaces, you ensure that changes in one part of the system don't send shockwaves of recompilation and broken code through completely unrelated components. Write interfaces that do one thing, and do it perfectly.