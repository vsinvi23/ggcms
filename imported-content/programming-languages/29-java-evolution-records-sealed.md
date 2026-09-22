# From Java 8 to 21: The Evolution of Records, Sealed Classes, and Pattern Matching

For years, Java developers faced a frustrating trade-off when designing data-centric architectures. Modeling simple domain data required writing hundreds of lines of boilerplate—getters, setters, `hashCode()`, `equals()`, and `toString()`—or relying on bytecode-generation libraries like Lombok. Worse, representing closed domain models (like a fixed set of payment methods) in a type-safe, compiler-verifiable way was nearly impossible. Developers had to choose between open-ended inheritance hierarchies or brittle, error-prone run-time type checks.

Java 21 fundamentally changes this paradigm. By uniting **Records**, **Sealed Classes**, and **Pattern Matching**, Java introduces a modern data-modeling paradigm: **Algebraic Data Types (ADTs)**. This article explores how these features work under the hood, how they enable compiler-enforced domain completeness, and how they eliminate defensive boilerplate.

---

## The Mental Model: Algebraic Data Types (ADTs)

To understand Java's evolution, we must shift our mental model from traditional object-oriented inheritance toward mathematical data modeling. In functional programming, domain models are represented as Algebraic Data Types (ADTs):

1. **Product Types (Records):** A type that is defined by the combination of other types. For example, a `Point(int x, int y)` is the *product* of `int` and `int`. Its state space is the Cartesian product of its components.
2. **Sum Types (Sealed Classes):** A type that can only be one of a strictly bounded set of types. For example, a `Payment` is either a `CreditCard` *or* `PayPal` *or* `BankTransfer`. Its state space is the *sum* of its permitted subtypes.

```
       [ Sum Type: Payment (Sealed) ]
          /           |          \
         /            |           \
  [CreditCard]     [PayPal]    [BankTransfer]
   (Product)       (Product)     (Product)
```

In Java 8, we had no direct way to express sum types. Any class could be extended unless marked `final`, forcing us to write endless `instanceof` checks and fallback `else` branches. In Java 21, combining Records (Product Types) and Sealed Classes (Sum Types) allows the compiler to construct a closed-world assumption of your domain model.

---

## The Code: Java 8 Boilerplate vs. Java 21 ADTs

### The Legacy Way (Java 8)
In Java 8, representing a simple domain where a transaction can be processed via different payment methods required verbose classes and unsafe, imperative type casting.

```java
// Brittle payment domain in Java 8
public abstract class Payment {
    // Open to subclassing, no compiler-enforced limit
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
        // Highly unsafe: if a new subclass is added, this fails at run-time!
    }
}
```

### The Modern Way (Java 21)
In Java 21, we declare the sum type using the `sealed` keyword and permit only a specific set of records (product types). We then use pattern matching in a `switch` expression to handle each case exhaustively.

```java
// Clean, declarative domain in Java 21
public sealed interface Payment permits CreditCard, PayPal, BankTransfer {}

public record CreditCard(String cardNumber, String expiry) implements Payment {}
public record PayPal(String email) implements Payment {}
public record BankTransfer(String iban, String bic) implements Payment {}

public class PaymentProcessor {
    public void process(Payment payment) {
        // Pattern matching switch expression
        String result = switch (payment) {
            case CreditCard(String card, String exp) -> "Charging card: " + card;
            case PayPal(String email) -> "Billing PayPal: " + email;
            case BankTransfer(String iban, String bic) -> "Wiring funds to: " + iban;
            // No 'default' branch needed! The compiler proves exhaustiveness.
        };
        System.out.println(result);
    }
}
```

Under the hood, the compiler validates that every possible subclass permitted by the `Payment` interface is matched in the `switch` block. If you add `record Crypto(String wallet) implements Payment` to the permits list but forget to update the `PaymentProcessor`, the compiler will refuse to compile, catching the bug at compile-time rather than production run-time.

---

## Common Misconceptions

### 1. "Records are just syntactic sugar for POJOs."
**The Reality:** Records are **immutable data carriers**, not general-purpose mutable objects. They do not have setters, are implicitly `final`, and cannot extend other classes (as they already extend `java.lang.Record`). This makes them a poor fit for frameworks that rely on proxying and mutability, such as Hibernate/JPA entities. They are designed to represent data, not identity.

### 2. "Sealed classes are just fancy enums."
**The Reality:** Enums are limited to representing *single instances* of a type (e.g., `enum Color { RED, GREEN, BLUE }`). Sealed classes, however, restrict *hierarchies of types*. Each subtype of a sealed class can be a fully fledged class or a record with its own distinct state, methods, and lifecycle.

---

## Key Takeaways

* **Embrace Immutability:** Use records for Data Transfer Objects (DTOs), event payloads, and API requests to ensure thread safety and eliminate defensive copying.
* **Lock Down Domains:** Use `sealed` classes or interfaces whenever you have a domain model with a fixed, known set of variants. This prevents unauthorized subclassing and establishes a strong contract.
* **Let the Compiler Work for You:** Avoid `default` branches in pattern-matching `switch` expressions over sealed hierarchies. Omitting `default` ensures that the compiler will flag compile-time errors the moment a new variant is added to your domain model.
