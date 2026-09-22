# Feature Toggles: Branch by Abstraction and Decoupling Deployment from Software Release

## The Problem: The Perils of Long-Lived Feature Branches
Historically, developing a large feature took weeks. Developers would create a long-lived feature branch. When it was finally time to merge, they faced "Merge Hell"—massive conflicts, broken tests, and integration failures because the `main` branch had diverged significantly. 

This prevents Continuous Integration (CI) and Continuous Deployment (CD). The goal of CI is to merge code to `main` at least daily. But how do you merge unfinished code without breaking production?

## The Solution: Feature Toggles (Flags)
Feature Toggles decouple *deployment* (pushing code to production) from *release* (making the feature visible to users). You wrap unfinished code in conditional logic tied to a configuration flag.

### Architecture of a Toggle System
A robust toggle system (like LaunchDarkly or Unleash) consists of:
1. **Configuration Store:** A highly available datastore (Redis, etcd) holding flag states.
2. **Evaluation Engine:** SDKs embedded in the application that fetch rules and evaluate them locally to minimize latency.
3. **Rule Set:** Complex targeting (e.g., "Enable for 10% of users," "Enable for QA tenant").

## Implementation: Branch by Abstraction
When refactoring a core component or adding a large feature, use Branch by Abstraction alongside toggles.

1. **Create an Abstraction:** Define an interface for the component.
2. **Implement the New Logic:** Write the new implementation alongside the old one.
3. **Toggle the Implementation:** Use a feature flag at the injection point to route traffic.

**Code Example: Toggle Routing**
```java
public interface PaymentGateway {
    PaymentResult process(Order order);
}

public class StripeGateway implements PaymentGateway { /* ... */ }
public class NewAdyenGateway implements PaymentGateway { /* ... */ }

@Service
public class CheckoutService {
    private final PaymentGateway stripe;
    private final PaymentGateway adyen;
    private final FeatureFlagClient flags;

    public CheckoutService(StripeGateway stripe, NewAdyenGateway adyen, FeatureFlagClient flags) {
        this.stripe = stripe;
        this.adyen = adyen;
        this.flags = flags;
    }

    public void checkout(Order order, User user) {
        PaymentGateway gateway = stripe;
        
        // Dynamic evaluation based on User context
        if (flags.isEnabled("use_adyen_gateway", user.getId())) {
            gateway = adyen;
        }
        
        gateway.process(order);
    }
}
```

## Advanced Release Strategies
- **Canary Releases:** Turn the flag on for internal employees first, then 1% of production traffic, monitoring error rates and metrics. If errors spike, flip the flag back to false instantly—no rollback deployment required.
- **Dark Launches:** Execute the new code path, log the results, but *do not* return the results to the user (return the old path's results instead). Compare the outputs to verify correctness before going live.

## Technical Debt and Cleanup
Toggles introduce branching complexity and technical debt. Once a feature is fully released and stable, the toggle logic *must* be removed.
Best practice: When a pull request introducing a toggle is merged, immediately create a Jira ticket to remove the toggle in 30 days. Treat stale toggles as critical tech debt.
