---
title: "The Sprout Method: Adding Features to Untested Legacy Code Safely"
description: "How to add new functionality to a large, untested legacy class without touching its tangled internals, using Michael Feathers' Sprout Method and Characterization Tests to lock down existing behavior first."
type: "ARTICLE"
categorySlug: "software-design"
articleType: "GUIDE"
tags:
  - "refactoring"
  - "legacy-code"
  - "sprout-method"
  - "characterization-tests"
  - "clean-code"
  - "testing"
---

# The Sprout Method: Adding Features to Untested Legacy Code Safely

## The Problem: The Legacy Code Paradox

Michael Feathers, in *Working Effectively with Legacy Code*, defines legacy code simply as "code without tests." That definition creates a genuine paradox when you're asked to add a feature or fix a bug in a large, tightly coupled, untested class:

- To change the code safely, you need unit tests.
- To write unit tests, you usually need to refactor the code to make it testable.
- To refactor the code safely, you need... unit tests.

If you attempt a wholesale rewrite of a 5,000-line, deeply coupled function to inject proper dependencies, you will almost certainly break undocumented behavior that other parts of the system silently depend on. You need a way to add new functionality *without touching* the existing tangled logic at all.

## The Solution: The Sprout Method

The **Sprout Method** sidesteps the paradox entirely. Instead of modifying the untestable legacy code, treat it as a black box. Write the new functionality in a brand-new, fully isolated, fully tested class or function — the "sprout" — and make exactly one small change to the legacy code: a single call into that sprout.

```text
[ Legacy Class (untested, tightly coupled) ]
    |
    |--- legacy_method() {
    |        // ~1000 lines of existing, messy logic
    |
    |        // THE SPROUT CALL — the only new line in the legacy method
    |        new_data = SproutClass.process(old_data)
    |
    |        // ~1000 more lines of existing, messy logic
    |    }

============================================================
[ Sprout Class (new, isolated, covered by tests) ]
    |
    |--- process(data) {
    |        // new business logic, developed under TDD
    |    }
```

This isolates risk cleanly: the legacy code is barely touched, so it's very unlikely to regress, and the new code is developed and verified under modern test-driven standards from day one.

## Applying the Sprout Method: A Worked Example

An e-commerce system needs a new "Holiday Discount" applied to shopping carts.

**Before — the legacy code, untestable as-is:**

```python
class LegacyOrderProcessor:
    # Connects directly to the DB, reads global state — cannot be
    # instantiated or exercised in a unit test without heavy mocking.
    def calculate_total(self, cart_items):
        total = 0
        for item in cart_items:
            total += item.price * item.quantity

        # messy tax calculation
        total += (total * 0.08)

        # WE NEED TO ADD HOLIDAY DISCOUNT HERE

        # messy shipping calculation
        if total > 50:
            total += 10

        return total
```

Writing the discount logic directly inside `calculate_total` means it inherits every one of that method's untestable dependencies. Instead, sprout it out:

**Step 1 — write the sprout, in complete isolation, with its own tests:**

```python
class HolidayDiscountSprout:
    @staticmethod
    def apply_discount(current_total: float, is_holiday: bool) -> float:
        if is_holiday and current_total > 100:
            return current_total * 0.90  # 10% off
        return current_total

def test_holiday_discount():
    assert HolidayDiscountSprout.apply_discount(150, True) == 135.0
    assert HolidayDiscountSprout.apply_discount(50, True) == 50.0
    assert HolidayDiscountSprout.apply_discount(150, False) == 150.0
```

**Step 2 — make the single-line change in the legacy code:**

```python
class LegacyOrderProcessor:
    def calculate_total(self, cart_items, is_holiday_season):
        total = 0
        for item in cart_items:
            total += item.price * item.quantity

        total += (total * 0.08)

        # THE SPROUT CALL
        total = HolidayDiscountSprout.apply_discount(total, is_holiday_season)

        if total > 50:
            total += 10

        return total
```

The legacy method gained a new parameter and one new line — nothing else in its 1000-plus lines changed.

## Enhancing Safety with Characterization Tests

Before making even that single-line change, how do you know you haven't broken anything? Write **Characterization Tests** — tests that lock down what the system *actually does today*, bugs included, rather than what it's *supposed* to do:

1. Feed a known input, e.g. `[Item($10), Item($20)]`, into `calculate_total`.
2. Observe the current output (say, `$42.4`).
3. Assert exactly that: `assert processor.calculate_total(items) == 42.4`.

That test is now a safety harness. Insert the sprout call, rerun the characterization test — if it still passes, the legacy control flow around your insertion point is provably unchanged.

## Conclusion

Working with legacy systems is fundamentally risk management, not a coding-style exercise. The Sprout Method draws a hard boundary between the old code you don't trust and the new code you do, letting you ship features under real test coverage without a rewrite. Applied repeatedly over time, it gradually reduces a legacy class into a thin routing layer that calls out to a growing set of small, well-tested modules — a form of the Strangler Fig pattern applied at the method level rather than the service level.
