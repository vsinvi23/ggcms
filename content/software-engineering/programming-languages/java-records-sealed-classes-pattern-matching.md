---
title: "From Java 8 to 21: Records, Sealed Classes, and Algebraic Data Types"
description: "How Java 21 combines records (product types) and sealed classes (sum types) into compiler-enforced algebraic data types, eliminating boilerplate and unsafe instanceof casting chains from domain models."
type: "ARTICLE"
categorySlug: "programming-languages"
articleType: "GUIDE"
tags:
  - "java"
  - "java-21"
  - "records"
  - "sealed-classes"
  - "pattern-matching"
  - "algebraic-data-types"
---

# From Java 8 to 21: Records, Sealed Classes, and Algebraic Data Types

For years, Java developers faced a frustrating trade-off when modeling data. Simple domain data meant writing hundreds of lines of boilerplate — getters, setters, `hashCode()`, `equals()`, `toString()` — or reaching for bytecode-generation libraries like Lombok. Worse, representing a *closed* domain model (a fixed set of payment methods, say) in a way the compiler could actually verify was nearly impossible: you either had an open-ended inheritance hierarchy anyone could extend, or brittle run-time type checks that silently broke when a new case was added.

Java 21 changes this by uniting **records**, **sealed classes**, and **pattern matching** into a coherent data-modeling paradigm borrowed from functional languages: **algebraic data types (ADTs)**.

---

## The Mental Model: Algebraic Data Types

Shift your mental model from open-ended OO inheritance to mathematical data modeling. In this framing, domain models are either:

1. **Product types (records)** — a type defined by the combination of other types. `Point(int x, int y)` is the *product* of `int` and `int`; its state space is the Cartesian product of its components.
2. **Sum types (sealed classes)** — a type that can only be one of a strictly bounded set of alternatives. `Payment` is either `CreditCard` *or* `PayPal` *or* `BankTransfer`; its state space is the *sum* of its permitted subtypes.

```
       [ Sum Type: Payment (Sealed) ]
          /           |          \
         /            |           \
  [CreditCard]     [PayPal]    [BankTransfer]
   (Product)       (Product)     (Product)
```

Java 8 had no direct way to express sum types — any non-`final` class could be extended by anyone, forcing endless `instanceof` chains with a fallback `else`. Java 21's combination of records (product types) and sealed classes (sum types) lets the compiler enforce a *closed-world* view of your domain.

---

## The Code: Java 8 Boilerplate vs. Java 21 ADTs

### The Legacy Way (Java 8)

```java
// Brittle payment domain in Java 8
public abstract class Payment {
    // Open to subclassing — no compiler-enforced limit
}

public class CreditCardPayment extends Payment {
    private final String cardNumber;
    private final String expiry;

    public CreditCardPayment(String cardNumber, String expiry) {
        this.cardNumber = cardNumber;
        this.expiry = expiry;
    }

    public String getCardNumber() { return cardNumber; }
    public String getExpiry() { return expiry; }
    // equals, hashCode, toString boilerplate omitted...
}

public class PayPalPayment extends Payment {
    private final String email;

    public PayPalPayment(String email) {
        this.email = email;
    }

    public String getEmail() { return email; }
    // equals, hashCode, toString boilerplate omitted...
}

// Processing requires manual, error-prone casting
public void process(Payment payment) {
    if (payment instanceof CreditCardPayment) {
        CreditCardPayment cc = (CreditCardPayment) payment;
        System.out.println("Charging card: " + cc.getCardNumber());
    } else if (payment instanceof PayPalPayment) {
        PayPalPayment pp = (PayPalPayment) payment;
        System.out.println("Billing PayPal: " + pp.getEmail());
    } else {
        throw new IllegalArgumentException("Unknown payment type");
        // Highly unsafe: adding a new subclass later fails only at run time!
    }
}
```

### The Modern Way (Java 21)

```java
// Clean, declarative domain in Java 21
public sealed interface Payment permits CreditCard, PayPal, BankTransfer {}

public record CreditCard(String cardNumber, String expiry) implements Payment {}
public record PayPal(String email) implements Payment {}
public record BankTransfer(String iban, String bic) implements Payment {}

public class PaymentProcessor {
    public void process(Payment payment) {
        // Pattern-matching switch expression
        String result = switch (payment) {
            case CreditCard(String card, String exp) -> "Charging card: " + card;
            case PayPal(String email) -> "Billing PayPal: " + email;
            case BankTransfer(String iban, String bic) -> "Wiring funds to: " + iban;
            // No 'default' branch needed — the compiler proves exhaustiveness.
        };
        System.out.println(result);
    }
}
```

The compiler validates that every subtype permitted by the sealed `Payment` interface is matched somewhere in the `switch`. Add `record Crypto(String wallet) implements Payment` to the `permits` list but forget to update `PaymentProcessor`, and the build fails to compile — catching the missing case at compile time instead of in production.

---

## Common Misconceptions

**Misconception:** Records are just syntactic sugar for POJOs.
**Reality:** Records are **immutable data carriers**, not general-purpose mutable objects. They have no setters, are implicitly `final`, and cannot extend other classes (they already implicitly extend `java.lang.Record`). That makes them a poor fit for frameworks relying on proxying/mutability (e.g., Hibernate/JPA entities) — they're designed to represent data, not managed identity.

**Misconception:** Sealed classes are just fancy enums.
**Reality:** Enums represent a fixed set of *single instances* of one type (`enum Color { RED, GREEN, BLUE }`). Sealed classes restrict *hierarchies of types* — each permitted subtype can be a full class or record with its own distinct state, constructor logic, and behavior, not a fixed singleton value.

---

## Key Takeaways

- **Use records for immutable data** — DTOs, event payloads, API request/response bodies — to get thread safety and eliminate defensive copying for free.
- **Use sealed types whenever the domain has a fixed, known set of variants.** This turns an open hierarchy into one the compiler can reason about exhaustively.
- **Skip the `default` branch in pattern-matching switches over sealed hierarchies.** Leaving it out is what lets the compiler flag a missing case the moment a new variant is added — the whole safety benefit disappears if you paper over gaps with a catch-all `default`.
