---
title: "DRY, KISS, and YAGNI: The Pragmatic Balance Between Clean Code Principles"
description: "Why DRY, KISS, and YAGNI actively contradict each other when applied dogmatically, and how experienced engineers decide which principle wins in a given situation."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "dry"
  - "kiss"
  - "yagni"
  - "clean-code"
  - "software-design-principles"
  - "code-maintainability"
---

# DRY, KISS, and YAGNI: The Pragmatic Balance Between Clean Code Principles

## The Problem: The Dogmatic Developer

Every engineer eventually learns three famous acronyms: **DRY** (Don't Repeat Yourself), **KISS** (Keep It Simple, Stupid), and **YAGNI** (You Aren't Gonna Need It). They get taught as if they are universal laws, but in real codebases they frequently pull in opposite directions.

- You extract a "clever" shared abstraction to satisfy DRY, and it makes the code harder to follow — violating KISS.
- You build a flexible plugin system "just in case" to avoid future duplication (DRY), directly violating YAGNI, which says don't build for a future that hasn't arrived.
- You inline everything to keep functions dead simple (KISS), and six months later you're fixing the same bug in twelve copy-pasted places (violating DRY).

None of these three principles is wrong. The mistake is treating them as unconditional rules instead of tools that need judgment about *when* to apply them. This article walks through where each principle actually helps, where it gets misapplied, and how to tell the difference.

## Principle 1: DRY — Don't Repeat Yourself

**The concept:** every piece of *knowledge* in a system should have a single, unambiguous, authoritative representation. Note the wording carefully — DRY is about knowledge duplication, not code duplication. Those are not the same thing, and conflating them is the single most common way DRY gets misapplied.

**The goal:** maintainability. If a business rule changes, you want exactly one place to change it.

### The misapplication: premature abstraction

Imagine two unrelated services: one calculates shipping cost, one calculates payroll deductions. Both happen to multiply an amount by 10%:

```javascript
// Service A: Shipping
function calculateShippingTax(amount) {
    return amount * 0.10;
}

// Service B: Payroll
function calculatePayrollTax(amount) {
    return amount * 0.10;
}
```

A developer who has internalized DRY as a rule rather than a principle sees this and immediately extracts a shared `TaxUtils.calculateTax(amount, rate)` used by both services.

Six months later, the government raises the shipping tax rate to 12% while payroll tax stays at 10%. The shared utility now needs a branch:

```javascript
// The wrong abstraction, forced to grow special cases
function calculateTax(amount, context) {
    if (context === 'shipping') return amount * 0.12;
    if (context === 'payroll') return amount * 0.10;
    throw new Error('unknown context');
}
```

This function now encodes two unrelated business rules that happen to change independently, coupled through a single piece of shared code. Every future change to either tax rate risks breaking the other. That's not DRY working correctly — it's the *wrong abstraction*, and it's strictly worse than the duplication it replaced.

**The rule that actually matters:** two pieces of code should only be merged if they represent the *same business concept* and will *always change for the same reason*. As Sandi Metz put it, "duplication is far cheaper than the wrong abstraction." If shipping tax and payroll tax are conceptually different rules that happen to share a formula today, leave them as separate functions — the duplication is honest, and each one is free to evolve independently.

## Principle 2: YAGNI — You Aren't Gonna Need It

**The concept:** implement something when you actually need it, not when you merely predict you'll need it eventually.

**The goal:** prevent speculative, over-engineered code that costs time to build and maintain but never gets used.

### The misapplication: refusal to architect

Taken to an extreme, YAGNI becomes an excuse to skip *any* structural decision: "We don't need a repository interface, we're just using MySQL right now."

```java
// Anti-pattern: YAGNI stretched to justify no architecture at all
public class UserController {
    public void createUser(String username, String password) {
        // Direct, hardcoded SQL connection inside an HTTP controller
        var conn = MySQLDriver.connect("root", "password");
        conn.execute("INSERT INTO users (username, password) VALUES ('"
            + username + "', '" + password + "')");
    }
}
```

Besides the glaring SQL injection risk, this locks the controller directly to MySQL's driver API. If the team later needs to switch databases, add a caching layer, or unit test the controller without a live database, they face a full rewrite — not because they anticipated a need too early, but because they refused to draw *any* boundary at all.

**The pragmatic balance:** YAGNI applies to *features*, not to *architecture*. Don't build a configuration screen nobody asked for, a multi-tenancy system with one tenant, or a plugin framework with zero plugins. But *do* use basic decoupling patterns — dependency injection, interfaces at genuine seams, separating I/O from business logic — because those don't cost you extra features today, they just keep the code soft enough to change later:

```java
public class UserController {
    private final UserRepository users;

    public UserController(UserRepository users) {
        this.users = users;
    }

    public void createUser(String username, String hashedPassword) {
        users.save(new User(username, hashedPassword));
    }
}

interface UserRepository {
    void save(User user);
}
```

This isn't over-engineering — a repository interface with one implementation costs almost nothing to write, and it's the difference between a config change and a rewrite when the database changes.

## Principle 3: KISS — Keep It Simple, Stupid

**The concept:** given a choice, prefer the simpler solution. Complexity should be justified by a real requirement, not added for its own sake.

**The goal:** readability and low cognitive load. Code gets read far more often than it gets written.

### The misapplication: "clever" code

Developers frequently confuse *fewer characters* with *simpler*. Learning a new language feature — nested ternaries, regex, metaprogramming — creates a temptation to compress ten readable lines into one dense line:

```javascript
// "Clever," but not simple
const status = (u.age > 18) ? (u.hasLicense ? 'CAN_DRIVE' : 'NEEDS_LICENSE') : 'TOO_YOUNG';
```

This is shorter, but it costs the next reader real effort: they have to mentally parse two nested conditionals to reconstruct the three possible outcomes. That effort compounds every time someone touches this line at 2 a.m. during an incident.

**The pragmatic balance:** simplicity is about intent, not line count.

```javascript
// Actually simple
let status = 'TOO_YOUNG';

if (u.age > 18) {
    status = u.hasLicense ? 'CAN_DRIVE' : 'NEEDS_LICENSE';
}
```

This version is longer but trivially steppable in a debugger, and its structure matches how a person naturally reasons about the rule: age first, then license status.

## How the Three Principles Interact

```
+-----------------------------------------------------------------+
|                  THE PRAGMATIC DECISION FLOW                    |
+-----------------------------------------------------------------+
|                                                                   |
|  Do I have duplicated CODE?                                     |
|        |                                                         |
|        v                                                         |
|  Does it represent the SAME business concept, changing for      |
|  the SAME reason?                                                |
|        |                        |                                |
|       YES                       NO                               |
|        |                        |                                |
|        v                        v                                |
|   Apply DRY:              Leave duplicated.                      |
|   extract shared           Merging unrelated concepts            |
|   abstraction.             is the "wrong abstraction."           |
|                                                                   |
|  Am I building a feature nobody asked for yet?                  |
|        |                        |                                |
|       YES                       NO                                |
|        |                        |                                |
|        v                        v                                |
|   Apply YAGNI:            This is architecture/decoupling,        |
|   don't build it yet.      not a feature. Build the seam          |
|                             (interface, DI) — it's cheap now,     |
|                             expensive to retrofit later.          |
|                                                                   |
|  Is this code hard for the next reader to trace?                |
|        |                        |                                |
|       YES                       NO                               |
|        |                        |                                |
|        v                        v                                |
|   Apply KISS:              Leave it. Fewer lines isn't the        |
|   rewrite for clarity,     goal — traceable intent is.            |
|   even if it's longer.                                           |
+-----------------------------------------------------------------+
```

## Common Misconceptions

**Misconception:** "DRY means never write the same code twice."
**Reality:** DRY is about knowledge, not text. Two functions that look identical today but represent different business rules should stay separate — they will diverge, and a shared abstraction just delays and complicates that divergence.

**Misconception:** "YAGNI means don't use interfaces, dependency injection, or design patterns."
**Reality:** YAGNI targets speculative *features*. Structural decoupling that costs little today and saves a rewrite later is good engineering, not "gold plating."

**Misconception:** "KISS means write the shortest possible code."
**Reality:** KISS means write code that's easiest to *understand and trace*, which is frequently a few lines longer, not shorter, than the "clever" version.

## Key Takeaways

- **DRY** removes duplicated *business logic*, but tolerates duplicated *code* that represents genuinely different, independently-changing concepts.
- **YAGNI** prevents speculative *features*, but is not a license to skip basic architectural seams like interfaces and dependency injection.
- **KISS** optimizes for the next reader's cognitive load, not for line count — an explicit `if` chain often beats a dense one-liner.
- All three principles can conflict in a single decision. When they do, ask: what will change independently, what will actually be needed, and what will the next engineer find easiest to reason about — then let that context decide, not the acronym.

## What to Learn Next

- SOLID principles, especially the Single Responsibility and Open/Closed principles, which formalize when an abstraction boundary is worth drawing.
- Domain-Driven Design's concept of bounded contexts, which gives DRY a much sharper rule for "same knowledge, same reason to change."
- Refactoring patterns (Extract Method, Extract Interface) as the mechanical tools for correcting a premature or a missing abstraction after the fact.
