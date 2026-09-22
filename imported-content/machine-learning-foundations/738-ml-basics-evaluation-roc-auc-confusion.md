# Evaluating ML Models: Precision, Recall, F1-Score, and ROC-AUC

## The Problem
Relying solely on Accuracy (Correct Predictions / Total Predictions) to evaluate classification models is a critical engineering flaw when dealing with imbalanced datasets. If a fraud detection dataset contains 99% legitimate transactions and 1% fraud, a naive model that always predicts "legitimate" achieves 99% accuracy but entirely fails its business objective (detecting fraud). The engineering requirement is to employ robust evaluation metrics that accurately quantify a model's performance on the minority class and its ability to separate classes across varying threshold probabilities.

## Technical Architecture

Model evaluation starts with the **Confusion Matrix**, a $2 \times 2$ table mapping Actual vs. Predicted classes:
- **True Positives (TP):** Model correctly predicted the positive class.
- **True Negatives (TN):** Model correctly predicted the negative class.
- **False Positives (FP) [Type I Error]:** Model falsely predicted positive.
- **False Negatives (FN) [Type II Error]:** Model falsely predicted negative.

### Derived Metrics
1. **Precision:** Out of all instances the model *predicted* as positive, how many were actually positive? Focuses on minimizing False Positives.
   $$ \text{Precision} = \frac{TP}{TP + FP} $$
2. **Recall (Sensitivity):** Out of all *actual* positive instances, how many did the model find? Focuses on minimizing False Negatives.
   $$ \text{Recall} = \frac{TP}{TP + FN} $$
3. **F1-Score:** The harmonic mean of Precision and Recall. It penalizes extreme imbalances between the two.
   $$ \text{F1} = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}} $$

### ROC Curve and AUC
Most classifiers output a probability (e.g., $0.85$ chance of fraud). By default, a threshold of $0.5$ is used to convert probabilities to discrete labels. 
The **Receiver Operating Characteristic (ROC)** curve plots the True Positive Rate (Recall) against the False Positive Rate ($\frac{FP}{FP+TN}$) across *all possible probability thresholds*. 

The **Area Under the Curve (AUC)** summarizes this into a single scalar between $0.0$ and $1.0$. An AUC of $1.0$ indicates perfect separation; $0.5$ indicates a random guess.

```text
  1.0 +----------------------------------+  <-- Perfect Model (AUC=1.0)
      |         . - * ~ ~ ~ ~ ~ * - .    |
  0.8 |     . '                       ' .|  <-- Strong Model (AUC=0.85)
 T    |   /                              |
 P  0.6 | /                              |
 R    |/                                 |
      |                                  |
  0.2 |          Random Guess (AUC=0.5)  |
      |                                  |
  0.0 +----------------------------------+
     0.0     0.2     0.4     0.6     0.8     1.0
                  False Positive Rate (FPR)
```

## Implementation

We demonstrate metric extraction and threshold manipulation using scikit-learn on an artificially imbalanced dataset.

```python
import numpy as np
from sklearn.datasets import make_classification
from sklearn.model_selection import train_test_split
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import confusion_matrix, precision_score, recall_score, f1_score, roc_auc_score

if __name__ == "__main__":
    # Generate imbalanced dataset (90% negative, 10% positive)
    X, y = make_classification(n_samples=1000, n_features=10, weights=[0.90, 0.10], random_state=42)
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.3, random_state=42)

    # Train a baseline logistic regression model
    model = LogisticRegression()
    model.fit(X_train, y_train)

    # 1. Default Threshold (0.5) Evaluation
    y_pred_default = model.predict(X_test)
    
    print("--- Default Threshold (0.5) ---")
    print(f"Confusion Matrix:\n{confusion_matrix(y_test, y_pred_default)}")
    print(f"Precision: {precision_score(y_test, y_pred_default):.3f}")
    print(f"Recall:    {recall_score(y_test, y_pred_default):.3f}")
    print(f"F1-Score:  {f1_score(y_test, y_pred_default):.3f}")

    # 2. Probability predictions for ROC-AUC
    # predict_proba returns [P(class=0), P(class=1)]
    y_prob = model.predict_proba(X_test)[:, 1]
    
    print("\n--- Model Separation Power ---")
    print(f"ROC-AUC Score: {roc_auc_score(y_test, y_prob):.3f}")

    # 3. Tuning the Threshold for High Recall (e.g., medical diagnosis)
    # Shift threshold down to 0.2 to catch more positives, at the cost of more false positives
    threshold = 0.20
    y_pred_tuned = (y_prob >= threshold).astype(int)

    print(f"\n--- Tuned Threshold ({threshold}) ---")
    print(f"Confusion Matrix:\n{confusion_matrix(y_test, y_pred_tuned)}")
    print(f"Precision: {precision_score(y_test, y_pred_tuned):.3f}")
    print(f"Recall:    {recall_score(y_test, y_pred_tuned):.3f} <- Increased!")
    print(f"F1-Score:  {f1_score(y_test, y_pred_tuned):.3f}")
```

## System Constraints and Optimizations
Choosing the operating point (probability threshold) on the ROC curve is purely a business optimization problem, weighing the financial/systemic cost of a False Positive against a False Negative. In High-Frequency Trading fraud detection, False Positives (declining a valid card) damage user experience, demanding High Precision. In medical pathology, a False Negative (missing cancer) is catastrophic, demanding High Recall. 

While ROC-AUC is standard, if the dataset is *severely* imbalanced (e.g., 99.9% vs 0.1%), the False Positive Rate ($FP / (FP + TN)$) is artificially diluted by the massive number of True Negatives. In extreme imbalance paradigms, engineering pipelines must utilize the **Precision-Recall AUC (PR-AUC)**, which entirely ignores True Negatives and evaluates only the minority class separation power.
