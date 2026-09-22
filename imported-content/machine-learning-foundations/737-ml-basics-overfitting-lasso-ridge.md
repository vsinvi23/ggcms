# ML Model Tuning: Bias-Variance Tradeoff and L1/L2 Regularization

## The Problem
A machine learning model must generalize to unseen data. When a model is too simple (e.g., linear regression on highly non-linear data), it severely underfits, failing to capture the underlying pattern (High Bias). When a model is too complex (e.g., a deep decision tree or neural network), it overfits, memorizing the training noise and failing on the test set (High Variance). The engineering objective is to tune the model capacity to strike the optimal balance between bias and variance, minimizing total expected error.

## Technical Architecture

The mathematical decomposition of expected test error is:
$$ \text{Error} = \text{Bias}^2 + \text{Variance} + \text{Irreducible Error} $$

To constrain a model exhibiting high variance (overfitting), we apply **Regularization**. Regularization modifies the learning objective by adding a penalty term to the cost function, discouraging the model from learning excessively large, brittle parameter weights ($\theta$).

Let the unregularized cost function be $J_0(\theta)$.

### L2 Regularization (Ridge)
L2 penalizes the sum of the squared weights. It forces all weights to become very small, distributing the importance across all features evenly. It prevents any single feature from dominating the prediction.

$$ J_{Ridge}(\theta) = J_0(\theta) + \lambda \sum_{j=1}^{n} \theta_j^2 $$
*(Note: The bias term $\theta_0$ is typically excluded from regularization).*

### L1 Regularization (Lasso)
L1 penalizes the sum of the absolute values of the weights. Because its derivative is a constant (not proportional to the weight itself), L1 regularization acts as an intrinsic feature selector—it explicitly drives the weights of less important features to exactly zero, resulting in sparse models.

$$ J_{Lasso}(\theta) = J_0(\theta) + \lambda \sum_{j=1}^{n} |\theta_j| $$

```text
+-------------------+       +-------------------+       +-----------------------+
| Training Data     |       | Model Optimization|       | Regularization Term   |
| (High Noise)      | ----> | Min [ Loss(y, y^) |   +   | Lambda * Penalty(W) ] |
+-------------------+       +-------------------+       +-----------------------+
                                        |                       |
                                        v                       v
                             Fits the signal         Shrinks weights, prevents noise memorization
```

## Implementation

We demonstrate how L1 and L2 regularization impact the learned coefficients using scikit-learn. We will use a polynomial expansion to intentionally create a high-variance (overfitting) scenario, then apply Ridge and Lasso to control it.

```python
import numpy as np
from sklearn.linear_model import LinearRegression, Ridge, Lasso
from sklearn.preprocessing import PolynomialFeatures
from sklearn.pipeline import make_pipeline

def generate_data(n_samples: int = 20):
    np.random.seed(42)
    # Underlying true function is a simple sine wave
    X = np.sort(np.random.rand(n_samples) * 10)
    y = np.sin(X) + np.random.randn(n_samples) * 0.5 # Add noise
    return X.reshape(-1, 1), y

if __name__ == "__main__":
    X_train, y_train = generate_data()
    
    # 1. High Variance Model (Overfitting without regularization)
    # Degree 15 polynomial on 20 data points guarantees massive overfitting
    unregularized_model = make_pipeline(PolynomialFeatures(degree=15), LinearRegression())
    unregularized_model.fit(X_train, y_train)
    
    # 2. L2 Regularization (Ridge)
    ridge_model = make_pipeline(PolynomialFeatures(degree=15), Ridge(alpha=10.0))
    ridge_model.fit(X_train, y_train)
    
    # 3. L1 Regularization (Lasso)
    lasso_model = make_pipeline(PolynomialFeatures(degree=15), Lasso(alpha=0.1, max_iter=10000))
    lasso_model.fit(X_train, y_train)

    # Analyze Coefficients
    coef_unreg = unregularized_model.named_steps['linearregression'].coef_
    coef_ridge = ridge_model.named_steps['ridge'].coef_
    coef_lasso = lasso_model.named_steps['lasso'].coef_

    print(f"Unregularized - Max Coefficient Magnitude: {np.max(np.abs(coef_unreg)):.2e}")
    print(f"Ridge (L2) - Max Coefficient Magnitude: {np.max(np.abs(coef_ridge)):.2e}")
    print(f"Lasso (L1) - Number of Non-Zero Coefficients: {np.sum(coef_lasso != 0)} out of 16")
```

## System Constraints and Optimizations
Choosing between L1 and L2 is an architectural decision. 
- Use **L2 (Ridge)** when you expect most features to contribute to the target, and you want to prevent multicollinearity (highly correlated features getting unstable, massive weights). L2 yields robust, stable models.
- Use **L1 (Lasso)** in ultra-high-dimensional, sparse regimes (like text processing/TF-IDF) where you aggressively need to drop irrelevant features to reduce memory footprints and inference latency.

The hyperparameter $\lambda$ (or `alpha` in sklearn) controls the regularization strength. Tuning $\lambda$ requires cross-validation (e.g., K-Fold). A $\lambda$ too high induces High Bias (underfitting), driving all weights to zero. Furthermore, features **must** be standardized (zero mean, unit variance) before applying L1/L2. Because the penalty sums the weights blindly, features with small numerical ranges will naturally require large weights to impact the prediction, causing the regularization term to penalize them disproportionately if left unscaled.
