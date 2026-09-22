# Evaluating ML Models: Precision, Recall, F1-Score, and ROC-AUC

## The Problem
For classification tasks, overall **Accuracy** is a deceptive metric. In a dataset where 99% of transactions are legitimate and 1% are fraudulent, a "dumb" model that always predicts "legitimate" achieves 99% accuracy while failing its sole objective. To build robust production systems, engineers require metrics that dissect the types of errors the model makes: False Positives (Type I errors) versus False Negatives (Type II errors).

## Architectural Approach
Evaluation metrics are derived from the **Confusion Matrix**, which tallies actual versus predicted classes.

- **Precision**: Of all positive predictions, how many were actually positive? $TP / (TP + FP)$
- **Recall (Sensitivity)**: Of all actual positives, how many did we find? $TP / (TP + FN)$
- **F1-Score**: The harmonic mean of Precision and Recall. Useful for imbalanced datasets.
- **ROC-AUC**: The Area Under the Receiver Operating Characteristic curve. It plots True Positive Rate vs. False Positive Rate across all possible probability thresholds, measuring the model's inherent ability to separate classes regardless of threshold.

```text
               +-----------------------------------+
               |          Actual Class             |
               +-----------------+-----------------+
               |    Positive     |    Negative     |
+---------+----+-----------------+-----------------+
| Predicted    | True Positive   | False Positive  |
| Class   Pos  | (TP)            | (FP) - Type I   |
+---------+----+-----------------+-----------------+
| Predicted    | False Negative  | True Negative   |
| Class   Neg  | (FN) - Type II  | (TN)            |
+---------+----+-----------------+-----------------+
```

## Implementation

The following Python script calculates robust evaluation metrics using scikit-learn on an imbalanced classification problem, demonstrating why accuracy fails and how to analyze threshold probabilities.

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import (confusion_matrix, precision_score, 
                             recall_score, f1_score, roc_auc_score, accuracy_score)

def evaluate_imbalanced_model():
    # 1. Generate imbalanced dataset (90% negative, 10% positive)
    X, y = make_classification(n_samples=2000, n_features=10, 
                               weights=[0.90, 0.10], random_state=42)
    
    X_train, X_test, y_train, y_test = train_test_split(X, y, random_state=42)

    # 2. Train a basic classifier
    clf = LogisticRegression()
    clf.fit(X_train, y_train)

    # 3. Generate Predictions (Classes and Probabilities)
    preds = clf.predict(X_test)
    probs = clf.predict_proba(X_test)[:, 1]

    # 4. Evaluation
    acc = accuracy_score(y_test, preds)
    prec = precision_score(y_test, preds)
    rec = recall_score(y_test, preds)
    f1 = f1_score(y_test, preds)
    auc = roc_auc_score(y_test, probs)

    print("--- Model Metrics ---")
    print(f"Accuracy : {acc:.4f} (Deceptively High)")
    print(f"Precision: {prec:.4f} (When it says positive, it's right {prec*100:.1f}% of the time)")
    print(f"Recall   : {rec:.4f} (It caught {rec*100:.1f}% of all actual positives)")
    print(f"F1-Score : {f1:.4f}")
    print(f"ROC-AUC  : {auc:.4f}")

    print("\n--- Confusion Matrix ---")
    cm = confusion_matrix(y_test, preds)
    print(f"TN: {cm[0][0]} | FP: {cm[0][1]}")
    print(f"FN: {cm[1][0]}  | TP: {cm[1][1]}")

if __name__ == "__main__":
    evaluate_imbalanced_model()
```

## Trade-offs and Considerations
1. **Precision/Recall Tradeoff**: You cannot optimize both simultaneously. Lowering the classification threshold (e.g., from 0.5 to 0.2) will increase Recall (catch more positives) but destroy Precision (more false alarms). The choice depends entirely on business logic (e.g., in tumor detection, high Recall is preferred; in spam filtering, high Precision is preferred).
2. **AUC Applicability**: ROC-AUC is excellent for evaluating overall model separation power, but for *severely* imbalanced datasets, the Precision-Recall Curve (PR-AUC) provides a more accurate reflection of performance than ROC-AUC, as ROC heavily factors in the massive number of True Negatives.
3. **Threshold Calibration**: The default `.predict()` method assumes a 0.5 probability threshold. In production, engineers must extract the `.predict_proba()` arrays and explicitly set thresholds based on cost-benefit matrices.
