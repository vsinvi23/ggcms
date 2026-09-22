# Evaluating ML Models: Precision, Recall, F1-Score, and ROC-AUC Curves

Measuring the performance of a classification model using raw accuracy is one of the most dangerous anti-patterns in machine learning. Consider a fraud detection pipeline where only $0.1\%$ of transactions are fraudulent. A naive model that classifies *all* transactions as non-fraudulent achieves $99.9\%$ accuracy—yet it fails to catch a single fraudulent event, rendering it completely useless in production. To evaluate models rigorously, developers must employ metrics like **Precision, Recall, F1-Score**, and **ROC-AUC curves**.

---

## The Problem: The Accuracy Paradox and Class Imbalance

The **accuracy paradox** occurs because accuracy weighs all classifications equally, ignoring class distribution. In systems with highly imbalanced datasets (e.g., threat detection, medical diagnosis, or anomaly prediction), the cost of a false negative (failing to detect a breach) is vastly different from a false positive (flagging a benign login). 

To build reliable systems, we must analyze predictions using a **Confusion Matrix** to isolate and quantify these different error profiles.

---

## Technical Architecture of Evaluation Metrics

The Confusion Matrix divides class predictions into four distinct quadrants based on the relationship between ground truth and predicted labels:

```
                         ACTUAL CLASS
                       Positive     Negative
                    +------------+------------+
           Positive |  True Pos  | False Pos  |  -> Precision = TP / (TP + FP)
     PRED           |  (TP)      | (FP)       |
     CLASS          +------------+------------+
           Negative |  False Neg | True Neg   |
                    |  (FN)      | (TN)       |
                    +------------+------------+
                          |
                          v
                     Recall = TP / (TP + FN)
```

### 1. Precision
Precision measures the fidelity of positive predictions. Out of all items the model flagged as positive, how many were actually positive?

$$\text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}}$$

### 2. Recall (Sensitivity / True Positive Rate)
Recall measures the model's ability to find all positive instances. Out of all actual positives in the dataset, how many did the model capture?

$$\text{Recall} = \frac{\text{TP}}{\text{TP} + \text{FN}}$$

### 3. F1-Score
Precision and recall are often in tension: lowering your decision threshold increases recall but decreases precision. The F1-score is the **harmonic mean** of precision and recall, balancing both into a single metric:

$$F_1 = 2 \times \frac{\text{Precision} \times \text{Recall}}{\text{Precision} + \text{Recall}}$$

### 4. ROC and AUC Curves
While Precision, Recall, and F1 are calculated at a single, fixed classification threshold (e.g., $0.5$), the **Receiver Operating Characteristic (ROC)** curve is a threshold-invariant metric. It plots the True Positive Rate (TPR / Recall) against the False Positive Rate (FPR) across all possible decision thresholds:

$$\text{TPR} = \frac{\text{TP}}{\text{TP} + \text{FN}}, \quad \text{FPR} = \frac{\text{FP}}{\text{FP} + \text{TN}}$$

The **Area Under the Curve (AUC)** measures the probability that a randomly chosen positive instance will be ranked higher by the model than a randomly chosen negative instance. An AUC of $1.0$ represents a perfect classifier; an AUC of $0.5$ represents random guessing.

---

## Complete NumPy Implementation of Core Metrics

Below is a complete, vectorized implementation that calculates a confusion matrix, computes Precision, Recall, and F1-score, and derives coordinates to plot an ROC curve from raw model probability outputs.

```python
import numpy as np

class ClassificationEvaluator:
    @staticmethod
    def calculate_binary_metrics(y_true: np.ndarray, y_pred_prob: np.ndarray, threshold: float = 0.5) -> dict:
        """
        Computes precision, recall, and F1-score at a specific threshold.
        """
        y_pred = (y_pred_prob >= threshold).astype(int)
        
        tp = np.sum((y_true == 1) & (y_pred == 1))
        fp = np.sum((y_true == 0) & (y_pred == 1))
        fn = np.sum((y_true == 1) & (y_pred == 0))
        tn = np.sum((y_true == 0) & (y_pred == 0))

        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0

        return {
            "confusion_matrix": {"TP": int(tp), "FP": int(fp), "FN": int(fn), "TN": int(tn)},
            "precision": float(precision),
            "recall": float(recall),
            "f1_score": float(f1)
        }

    @staticmethod
    def compute_roc_curve(y_true: np.ndarray, y_pred_prob: np.ndarray) -> tuple:
        """
        Computes threshold coordinates (FPR, TPR) for plotting an ROC curve.
        """
        # Sort predictions and corresponding true labels in descending order
        desc_indices = np.argsort(y_pred_prob)[::-1]
        y_pred_prob_sorted = y_pred_prob[desc_indices]
        y_true_sorted = y_true[desc_indices]

        # Find unique thresholds
        thresholds = np.unique(y_pred_prob_sorted)[::-1]
        
        tpr_coords = []
        fpr_coords = []
        
        n_positives = np.sum(y_true == 1)
        n_negatives = np.sum(y_true == 0)

        for t in thresholds:
            y_pred = (y_pred_prob_sorted >= t).astype(int)
            tp = np.sum((y_true_sorted == 1) & (y_pred == 1))
            fp = np.sum((y_true_sorted == 0) & (y_pred == 1))
            
            tpr = tp / n_positives if n_positives > 0 else 0.0
            fpr = fp / n_negatives if n_negatives > 0 else 0.0
            
            tpr_coords.append(tpr)
            fpr_coords.append(fpr)

        # Append boundary endpoints (0,0) and (1,1)
        tpr_coords = [0.0] + tpr_coords + [1.0]
        fpr_coords = [0.0] + fpr_coords + [1.0]

        return np.array(fpr_coords), np.array(tpr_coords)
```

---

## Developer Takeaways

* **F1 vs. ROC-AUC:** F1-score is highly threshold-dependent and sensitive to class distribution. ROC-AUC is threshold-invariant and evaluates the model's overall ranking ability.
* **PR-AUC vs. ROC-AUC:** If your dataset has extreme class imbalance (e.g., $1$ positive in $100,000$ negative rows), use a **Precision-Recall (PR) AUC** curve instead of ROC-AUC. ROC-AUC can remain deceptively high (e.g., $0.99$) because the large number of true negatives ($TN$) keeps the False Positive Rate ($FPR = FP / (FP + TN)$) near zero, masking a high volume of False Positives.
* **Define Business Costs:** Never tune model thresholds in a vacuum. Work with stakeholders to define the real business costs of errors:
  $$\text{Expected Cost} = \text{FP} \times C_{\text{FP}} + \text{FN} \times C_{\text{FN}}$$
  Select the decision threshold that minimizes this expected cost.
