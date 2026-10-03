---
title: "The Open/Closed Principle: Implementing the Strategy Pattern for Extensibility"
description: "How to escape God-class payment processors full of if/else conditionals by applying the Open/Closed Principle through the Strategy pattern, with a full TypeScript walkthrough."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "solid-principles"
  - "open-closed-principle"
  - "strategy-pattern"
  - "typescript"
  - "design-patterns"
---

# The Open/Closed Principle: Implementing the Strategy Pattern for Extensibility

In the lifecycle of every successful software project, there comes a moment when a core file becomes a "God Class." It starts innocently enough — an `if` statement here, a `switch` case there. But fast-forward a year, and your `PaymentProcessor` class is a 2,000-line behemoth of tangled conditionals handling Stripe, PayPal, Apple Pay, and cryptocurrency.

This violates the **Open/Closed Principle (OCP)**, the "O" in the SOLID principles of object-oriented design. In this article, we'll explore the devastating effects of OCP violations and how to resolve them using the **Strategy Pattern**.

## The Problem: Modification Instead of Extension

Consider a basic Order processing service:

```typescript
class OrderProcessor {
  public processPayment(order: Order, paymentMethod: string): void {
    if (paymentMethod === "STRIPE") {
      // 50 lines of Stripe HTTP API calls
      console.log("Processing via Stripe...");
    } else if (paymentMethod === "PAYPAL") {
      // 50 lines of PayPal SDK logic
      console.log("Processing via PayPal...");
    } else {
      throw new Error("Unsupported payment method");
    }
  }
}
```

This code works, but it is deeply flawed. What happens when the business wants to add "Klarna" next week?

You must open the `OrderProcessor` class, locate the `processPayment` method, and inject a new `else if` block. You are **modifying** existing, tested, and working code. By touching this file, you risk breaking Stripe and PayPal. You also force the entire application module to be recompiled and re-tested.

### The Mental Model: The Plug-and-Play Console

Think of a video game console. When you want to play a new game, you don't unscrew the plastic casing, solder new chips onto the motherboard, and rebuild the hardware. The console provides a standardized slot. You simply slide a new cartridge (extension) into the slot. The console is **closed** for physical modification, but **open** for extension.

## The Solution: The Strategy Pattern

The Open/Closed Principle dictates: *"Software entities (classes, modules, functions) should be open for extension, but closed for modification."*

To achieve this, we extract the varying behavior (the payment logic) into separate classes that adhere to a common interface. This is the **Strategy Pattern**.

### Step 1: Define the Interface

First, we create a strict contract. Any payment method must implement this interface.

```typescript
// IPaymentStrategy.ts
export interface IPaymentStrategy {
  pay(amount: number): Promise<boolean>;
}
```

### Step 2: Implement Concrete Strategies

Next, we extract the Stripe and PayPal logic into their own isolated, hyper-focused classes. If the Stripe API changes, we only touch the Stripe file.

```typescript
// StripeStrategy.ts
export class StripeStrategy implements IPaymentStrategy {
  async pay(amount: number): Promise<boolean> {
    // Isolated Stripe API logic
    console.log(`Paid $${amount} using Stripe.`);
    return true;
  }
}

// PayPalStrategy.ts
export class PayPalStrategy implements IPaymentStrategy {
  async pay(amount: number): Promise<boolean> {
    // Isolated PayPal SDK logic
    console.log(`Paid $${amount} using PayPal.`);
    return true;
  }
}
```

### Step 3: The Context Class (Closing for Modification)

Finally, we rewrite our `OrderProcessor`. Instead of hardcoding conditionals, it will accept *any* object that adheres to `IPaymentStrategy`.

```typescript
// OrderProcessor.ts
export class OrderProcessor {
  private paymentStrategy: IPaymentStrategy;

  // Dependency Injection via constructor
  constructor(strategy: IPaymentStrategy) {
    this.paymentStrategy = strategy;
  }

  // Allow switching strategies at runtime
  public setStrategy(strategy: IPaymentStrategy) {
    this.paymentStrategy = strategy;
  }

  public async checkout(amount: number): Promise<void> {
    const success = await this.paymentStrategy.pay(amount);
    if (!success) {
      throw new Error("Payment failed.");
    }
  }
}
```

### Step 4: The Factory Mapping (Optional but Recommended)

To wire this together dynamically based on user input, we use a Factory or a DI container to instantiate the correct strategy:

```typescript
const paymentType = "STRIPE"; // e.g., from HTTP Request
let strategy: IPaymentStrategy;

switch (paymentType) {
  case "STRIPE": strategy = new StripeStrategy(); break;
  case "PAYPAL": strategy = new PayPalStrategy(); break;
}

const processor = new OrderProcessor(strategy);
processor.checkout(100.00);
```

## The Extensibility Payoff

When the product manager asks for "Klarna" integration, the engineering workflow fundamentally shifts.
You do not touch `OrderProcessor.ts`. You do not touch `StripeStrategy.ts`.

You simply create a new file: `KlarnaStrategy.ts` that implements `IPaymentStrategy`, and register it in the factory. The core domain logic remains pristine, untouched, and uncorrupted. By leveraging the Strategy Pattern, you have successfully built an architecture that is infinitely scalable and immune to regression bugs in legacy features.
