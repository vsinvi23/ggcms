# Feature Toggles: Branch by Abstraction and Decoupling Deployment from Software Release

## The Problem: The Merge Conflict and Delivery Bottleneck

In traditional software development, large features are developed on long-lived "feature branches." Developers work for weeks or months in isolation. When it is finally time to integrate, the team spends days navigating massive merge conflicts. Worse, a single buggy feature can hold up a release pipeline containing dozens of other critical bug fixes.

The core issue is that teams couple **Deployment** (pushing code to a server) with **Release** (exposing that code to users). 

If a feature takes three weeks to build, developers shouldn't wait three weeks to merge to the `main` branch. They should merge daily to ensure Continuous Integration (CI). But how do you deploy half-finished, untested code to production without breaking the application for your users?

## The Solution: Feature Toggles (Feature Flags)

Feature Toggles are conditional logic injected into the application that allows you to turn features on or off dynamically at runtime without modifying code or restarting the application.

By wrapping half-finished code in a toggle, you can merge it into `main` and deploy it to production safely. The feature is "Deployed" but not "Released." 

```text
[ User Request ]
       |
       v
[ Feature Toggle Router ] ---> (Checks toggle configuration from external service or DB)
       |
       |--- If Toggle 'NEW_CHECKOUT_FLOW' is OFF ---> [ Old Checkout Logic ]
       |
       |--- If Toggle 'NEW_CHECKOUT_FLOW' is ON  ---> [ New Checkout Logic ]
```

## Branch by Abstraction

To implement Feature Toggles cleanly without littering the codebase with messy `if/else` statements, architects use the **Branch by Abstraction** pattern.

Instead of writing a feature branch in Git, you write an abstraction in code.
1. Extract the current functionality behind an Interface.
2. Build a new implementation of that Interface (the new feature).
3. Use a Factory or Dependency Injection to yield the old or new implementation based on the runtime evaluation of the Feature Toggle.

## Robust Code: Implementing Branch by Abstraction

Imagine we are replacing a legacy payment gateway (Stripe) with a new one (Adyen). We want to test Adyen in production for internal users only, before rolling it out to customers.

```python
from abc import ABC, abstractmethod

# 1. The Abstraction
class PaymentGateway(ABC):
    @abstractmethod
    def process_payment(self, user_id: str, amount: float) -> bool:
        pass

# 2. The Legacy Implementation
class StripeGateway(PaymentGateway):
    def process_payment(self, user_id: str, amount: float) -> bool:
        print("Processing via Stripe (Legacy)...")
        return True

# 3. The New Implementation (WIP)
class AdyenGateway(PaymentGateway):
    def process_payment(self, user_id: str, amount: float) -> bool:
        print("Processing via Adyen (New System)...")
        return True

# 4. The Feature Toggle Router (Factory)
class PaymentGatewayFactory:
    def __init__(self, toggle_client):
        self.toggle_client = toggle_client
        self.legacy_gateway = StripeGateway()
        self.new_gateway = AdyenGateway()

    def get_gateway(self, user) -> PaymentGateway:
        # Evaluate the toggle dynamically based on user context
        is_enabled = self.toggle_client.is_enabled("use_adyen_gateway", user.id)
        
        if is_enabled:
            return self.new_gateway
        else:
            return self.legacy_gateway

# 5. Usage in the Application
class CheckoutService:
    def __init__(self, gateway_factory: PaymentGatewayFactory):
        self.factory = gateway_factory

    def complete_checkout(self, user, amount):
        # The business logic doesn't care which gateway is used!
        gateway = self.factory.get_gateway(user)
        success = gateway.process_payment(user.id, amount)
        return success
```

## Advanced Toggle Scenarios

Because toggle evaluation (like `toggle_client.is_enabled`) takes user context, you can achieve sophisticated deployment strategies:
1. **Canary Releases:** Turn the feature on for 1% of randomized traffic to monitor error rates and latency.
2. **Targeted Rollouts:** Turn the feature on for users whose email ends in `@mycompany.com` for internal QA testing in production.
3. **Kill Switches:** If the new feature causes a critical outage at 2 AM, the on-call engineer can log into a dashboard, flip the toggle to OFF, and revert the system to the legacy code instantly—without a rollback, without a CI/CD build, and without a restart.

## Cleanup is Mandatory

Feature toggles accrue **Technical Debt**. Once a feature is fully rolled out to 100% of users and validated, the toggle becomes obsolete. Engineering teams must routinely schedule "Toggle Cleanup" sprints to remove the `PaymentGatewayFactory`, delete the `StripeGateway`, and wire the `AdyenGateway` directly. Failure to do so leads to a labyrinth of dead code and exponential testing permutations.