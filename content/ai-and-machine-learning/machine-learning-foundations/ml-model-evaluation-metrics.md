---
title: "Machine Learning Model Evaluation & Drift Detection"
description: "A comprehensive reference guide covering classification, regression, and ranking evaluation metrics, alongside data and concept drift detection mechanisms in production MLOps."
type: "ARTICLE"
categorySlug: "machine-learning-foundations"
articleType: "REFERENCE"
tags:
  - "machine-learning"
---

# Machine Learning Model Evaluation & Drift Detection

Deploying machine learning models to production is only the first step in the MLOps lifecycle. Once live, models encounter real-world data distribution shifts, leading to silent performance degradation. 

Maintaining model reliability requires selecting domain-appropriate evaluation metrics during offline training and establishing automated statistical monitoring for **Data Drift** and **Concept Drift** in production.

---

## 1. Classification Evaluation Metrics

Selecting the right classification metric depends on the relative cost asymmetry between **False Positives (FP)** and **False Negatives (FN)**.

### Confusion Matrix Formulations

- **Precision** = $\frac{TP}{TP + FP}$  
  *Minimizes False Positives.* Critical when misclassifying a negative sample as positive is expensive (e.g. spam filtering, block-listing legitimate users).

- **Recall (Sensitivity / True Positive Rate)** = $\frac{TP}{TP + FN}$  
  *Minimizes False Negatives.* Critical when missing a positive case carries severe consequences (e.g. medical diagnosis, fraud detection, security vulnerability scanning).

- **F1 Score** = $2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$  
  Harmonic mean balancing Precision and Recall for imbalanced datasets.

- **ROC-AUC (Receiver Operating Characteristic - Area Under Curve)**  
  Measures model discrimination capability across all classification threshold boundaries (plotting True Positive Rate vs. False Positive Rate).

---

## 2. Regression Evaluation Metrics

| Metric | Formula | Sensitivity / Properties |
| :--- | :--- | :--- |
| **Mean Absolute Error (MAE)** | $\frac{1}{n} \sum_{i=1}^{n} \|y_i - \hat{y}_i\|$ | Robust to extreme outliers; measures average absolute residual magnitude. |
| **Mean Squared Error (MSE)** | $\frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2$ | Heavily penalizes large errors due to squaring term; useful for optimization. |
| **Root Mean Squared Error (RMSE)** | $\sqrt{\frac{1}{n} \sum_{i=1}^{n} (y_i - \hat{y}_i)^2}$ | In same units as target variable; sensitive to large prediction errors. |
| **Coefficient of Determination ($R^2$)** | $1 - \frac{\sum (y_i - \hat{y}_i)^2}{\sum (y_i - \bar{y})^2}$ | Proportion of variance in target variable explained by model features. |

---

## 3. Recommendation & Ranking Metrics (NDCG & MAP)

For search engines and content portals, result position ordering matters significantly.

### Normalized Discounted Cumulative Gain (NDCG)

Discounted Cumulative Gain (DCG) at rank position $k$ penalizes relevant items placed lower in search results:

$$\text{DCG}_k = \sum_{i=1}^{k} \frac{2^{\text{rel}_i} - 1}{\log_2(i + 1)}$$

$$\text{NDCG}_k = \frac{\text{DCG}_k}{\text{IDCG}_k}$$

where $\text{IDCG}_k$ is the Ideal DCG achieved by ordering search items perfectly by relevance score.

---

## 4. Detecting Production Data Drift & Concept Drift

```text
┌─────────────────────────────────────────────────────────────────────────┐
┌                               Types of Drift                            │
├───────────────────────────────┬─────────────────────────────────────────┤
│ Data Drift (Covariate Shift)  │ Feature distribution P(X) changes while  │
│                               │ target relation P(Y|X) remains static.   │
├───────────────────────────────┼─────────────────────────────────────────┤
│ Concept Drift                 │ Relation P(Y|X) changes (e.g. consumer  │
│                               │ behavior changes after macroeconomic shift)│
└───────────────────────────────┴─────────────────────────────────────────┘
```

### Python Implementation: Kolmogorov-Smirnov (KS) Test & Population Stability Index (PSI)

```python
import numpy as np
from scipy.stats import ks_2samp

def detect_ks_drift(reference_data: np.ndarray, current_data: np.ndarray, alpha: float = 0.05) -> dict:
    """Performs two-sample Kolmogorov-Smirnov test to detect feature distribution drift."""
    statistic, p_value = ks_2samp(reference_data, current_data)
    drift_detected = p_value < alpha
    return {
        "ks_statistic": float(statistic),
        "p_value": float(p_value),
        "drift_detected": drift_detected
    }

def calculate_psi(reference: np.ndarray, current: np.ndarray, num_buckets: int = 10) -> float:
    """Calculates Population Stability Index (PSI) for continuous numerical features."""
    percentiles = np.linspace(0, 100, num_buckets + 1)
    buckets = np.percentile(reference, percentiles)
    buckets[0] -= 1e-5
    buckets[-1] += 1e-5

    ref_counts, _ = np.histogram(reference, bins=buckets)
    curr_counts, _ = np.histogram(current, bins=buckets)

    ref_pct = ref_counts / len(reference)
    curr_pct = curr_counts / len(current)

    # Avoid division by zero
    ref_pct = np.where(ref_pct == 0, 1e-4, ref_pct)
    curr_pct = np.where(curr_pct == 0, 1e-4, curr_pct)

    psi = np.sum((curr_pct - ref_pct) * np.log(curr_pct / ref_pct))
    return float(psi)
```

---

## 5. Key Takeaways

1. Match metrics to business risk profiles (e.g. Recall for high-severity security scanning, Precision for low-friction user experience).
2. Measure **NDCG@10** and **MAP@10** for recommendation feeds powering search interfaces.
3. Automatically trigger retraining pipelines when **PSI > 0.2** or **KS test p-value < 0.05**.
