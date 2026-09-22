# Evaluating ML Models: Precision, Recall, F1-Score, and ROC-AUC

## The Problem
In commercial applications, classifiers are frequently evaluated using accuracy. However, accuracy is a highly deceptive metric for imbalanced datasets. For instance, in credit card fraud detection where only 0.1% of transactions are fraudulent, a naive classifier that predicts "no fraud" for every instance achieves a 99.9% accuracy. Yet, this model is completely useless for identifying actual fraud. 

Relying on accuracy in such scenarios can lead to catastrophic business losses because the model fails to detect critical, low-frequency positive events (high False Negatives) or floods operational teams with false alarms (high False Positives). To evaluate classifiers effectively, we need a robust metrics framework that exposes false positives, false negatives, classification trade-offs, and absolute discriminative power across all decision thresholds.

## Technical Architecture

Model evaluation is built on the **Confusion Matrix**—a tabular layout mapping actual values against model predictions.

```text
                     Actual Positive (1)      Actual Negative (0)
                  +------------------------+------------------------+
   Predicted      |  True Positive (TP)    |  False Positive (FP)   |
   Positive (1)   |  (Detected positive)   |  (False alarm)         |
                  +------------------------+------------------------+
   Predicted      |  False Negative (FN)   |  True Negative (TN)    |
   Negative (0)   |  (Missed positive)     |  (Correct exclusion)   |
                  +------------------------+------------------------+
```

### 1. Derived Evaluation Metrics
From the confusion matrix values, we compute several key performance metrics:

* **Precision (Positive Predictive Value)**: The proportion of positive predictions that were actually positive. It quantifies the cost of false alarms:

$$ \text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}} $$

* **Recall (Sensitivity / True Positive Rate)**: The proportion of actual positives that were correctly identified. It quantifies the cost of missed events:

$$ \text{Recall (TPR)} = \frac{\text{TP}}{\text{TP} + \text{FN}} $$

* **F1-Score**: The harmonic mean of Precision and Recall, which balances both metrics into a single score:

$$ F_1 = 2 \cdot \frac{\text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}} = \frac{2\text{TP}}{2\text{TP} + \text{FP} + \text{FN}} $$

### 2. ROC Curve and Area Under the Curve (AUC)
Most classifiers output continuous probabilities rather than hard classes. Changing the probability threshold (e.g., from 0.5 to 0.7) alters predictions, changing Precision and Recall.

To evaluate a model independently of the chosen threshold, we use the **Receiver Operating Characteristic (ROC)** curve. The ROC curve plots the **True Positive Rate (TPR)** against the **False Positive Rate (FPR)** across all possible decision thresholds in $[0, 1]$:

$$ \text{FPR} = \frac{\text{FP}}{\text{TN} + \text{FP}} = 1 - \text{Specificity} $$

```text
    True Positive Rate (TPR / Recall)
    1.0 +                             *****************  (Perfect Classifier: AUC = 1.0)
        |                      *******
        |                   ***
        |                 **
        |               **
        |             *             (Random Classifier: AUC = 0.5)
        |          *  *  *  *  *  *  *  *  *  *  *  *
        |        *
        |     ***
    0.0 +*****-----------------------------------------+
       0.0                                            1.0
                               False Positive Rate (FPR)
```

The **Area Under the Curve (ROC-AUC)** measures the overall quality of the probability ranking. A perfect classifier has an AUC of 1.0, while a purely random classifier has an AUC of 0.5. Mathematically, ROC-AUC represents the probability that a randomly chosen positive sample will be scored higher by the model than a randomly chosen negative sample.

## Implementation

The following is a comprehensive, pure-NumPy evaluation suite. It computes the confusion matrix, calculates Precision, Recall, and F1-Score, and generates ROC coordinates and the AUC score using the trapezoidal integration rule.

```python
import numpy as np
from typing import Tuple, Dict, List

class ClassificationEvaluationSuite:
    @staticmethod
    def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray) -> np.ndarray:
        """
        Computes the 2x2 confusion matrix.
        """
        tp = np.sum((y_true == 1) & (y_pred == 1))
        fp = np.sum((y_true == 0) & (y_pred == 1))
        fn = np.sum((y_true == 1) & (y_pred == 0))
        tn = np.sum((y_true == 0) & (y_pred == 0))
        return np.array([[tp, fp], 
                         [fn, tn]])

    @staticmethod
    def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        cm = ClassificationEvaluationSuite.confusion_matrix(y_true, y_pred)
        tp, fp = cm[0, 0], cm[0, 1]
        fn, tn = cm[1, 0], cm[1, 1]
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        specificity = tn / (tn + fp) if (tn + fp) > 0 else 0.0
        f1_score = 2 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        accuracy = (tp + tn) / len(y_true)
        
        return {
            "Accuracy": float(accuracy),
            "Precision": float(precision),
            "Recall_TPR": float(recall),
            "Specificity": float(specificity),
            "F1_Score": float(f1_score)
        }

    @staticmethod
    def compute_roc_curve(y_true: np.ndarray, y_probs: np.ndarray) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
        """
        Calculates False Positive Rate and True Positive Rate coordinates across all thresholds.
        """
        # Sort probabilities and corresponding actual values descending
        sorted_indices = np.argsort(y_probs)[::-1]
        y_probs_sorted = y_probs[sorted_indices]
        y_true_sorted = y_true[sorted_indices]
        
        # Include boundary thresholds 1.0 and 0.0
        thresholds = np.concatenate([[y_probs_sorted[0] + 1e-5], y_probs_sorted, [0.0]])
        
        n_pos = np.sum(y_true == 1)
        n_neg = np.sum(y_true == 0)
        
        tprs = []
        fprs = []
        
        # Iterate over thresholds to calculate TPR and FPR coordinates
        for t in thresholds:
            y_pred = (y_probs >= t).astype(int)
            tp = np.sum((y_true == 1) & (y_pred == 1))
            fp = np.sum((y_true == 0) & (y_pred == 1))
            
            tprs.append(tp / n_pos if n_pos > 0 else 0.0)
            fprs.append(fp / n_neg if n_neg > 0 else 0.0)
            
        return np.array(fprs), np.array(tprs), thresholds

    @staticmethod
    def compute_roc_auc(fprs: np.ndarray, tprs: np.ndarray) -> float:
        """
        Computes Area Under the ROC Curve using the trapezoidal integration rule.
        """
        # Ensure fprs are sorted ascending for integration
        sorted_indices = np.argsort(fprs)
        fprs_sorted = fprs[sorted_indices]
        tprs_sorted = tprs[sorted_indices]
        
        # Integrate using the trapezoidal rule: Area = Sum of (FPR_i - FPR_(i-1)) * (TPR_i + TPR_(i-1)) / 2
        auc = 0.0
        for i in range(1, len(fprs_sorted)):
            df = fprs_sorted[i] - fprs_sorted[i - 1]
            avg_t = (tprs_sorted[i] + tprs_sorted[i - 1]) / 2.0
            auc += df * avg_t
            
        return float(auc)

if __name__ == "__main__":
    # Generate mock validation binary data
    np.random.seed(42)
    y_true_data = np.array([1, 1, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 1, 0, 1])
    # Mock probabilities outputted by model
    y_probs_data = np.array([0.92, 0.85, 0.15, 0.72, 0.35, 0.10, 0.88, 0.45, 0.65, 0.20, 0.40, 0.55, 0.75, 0.12, 0.60])

    # Convert probability outputs into hard class decisions using standard threshold 0.5
    y_pred_hard = (y_probs_data >= 0.5).astype(int)

    # 1. Evaluate standard confusion matrix and scores
    metrics = ClassificationEvaluationSuite.calculate_metrics(y_true_data, y_pred_hard)
    print("--- Classification Evaluation Results ---")
    print(f"Confusion Matrix:\n{ClassificationEvaluationSuite.confusion_matrix(y_true_data, y_pred_hard)}")
    for metric_name, val in metrics.items():
        print(f"{metric_name:12s}: {val:.4f}")

    # 2. Compute ROC Curve and AUC
    fpr, tpr, th = ClassificationEvaluationSuite.compute_roc_curve(y_true_data, y_probs_data)
    auc_score = ClassificationEvaluationSuite.compute_roc_auc(fpr, tpr)
    print(f"\nROC-AUC Score: {auc_score:.5f}")
```

## System Constraints and Optimizations
Selecting metrics for operational systems requires careful consideration of the following trade-offs:

1. **Precision-Recall Inverse Relationship**: You cannot optimize Precision and Recall simultaneously. Increasing the probability threshold (making the model more selective) increases Precision but lowers Recall (as the model misses marginal positive cases). Decreasing the threshold increases Recall but generates more false alarms, lowering Precision.
2. **ROC-AUC vs. PR-AUC on Highly Imbalanced Data**: ROC-AUC can be overly optimistic on highly imbalanced datasets. This is because FPR's denominator includes True Negatives ($TN$), which is extremely large in highly imbalanced datasets. As a result, massive increases in False Positives ($FP$) cause only small changes in FPR, artificially inflating the ROC-AUC score. 

**Production Recommendation**: For highly imbalanced datasets (e.g., fraud or anomaly detection), prioritize **Precision-Recall AUC (PR-AUC)** or the **F1-Score** over ROC-AUC. Focus on tuning decision thresholds directly to align with business costs (e.g., weighing the cost of a false alarm against the cost of a missed fraud event).
