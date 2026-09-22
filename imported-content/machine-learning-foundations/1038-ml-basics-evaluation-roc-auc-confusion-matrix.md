# Evaluating ML Models: Precision, Recall, F1-Score, and ROC-AUC

## The Problem
For binary classification models deployed in real-world environments, raw Accuracy is often a deceptive performance metric. Consider a credit card transaction stream where only $0.1\%$ of transactions are fraudulent. A naive baseline classifier that simply predicts "legitimate" for every transaction achieves an impressive $99.9\%$ accuracy while failing completely to detect a single instance of fraud.

Relying purely on accuracy in skewed data distributions hides severe model failures. Different production environments present asymmetrical costs for model errors. For instance, in cyber threat detection, a False Negative (letting an attacker pass) is catastrophic, while a False Positive (prompting a security administrator) is an acceptable inconvenience. The engineering challenge is to implement a robust, threshold-agnostic evaluation framework that quantifies precision, recall, classification trade-offs, and ranking capabilities under severe class imbalance.

## Technical Architecture

To thoroughly evaluate a binary classifier, we analyze its predictions against ground-truth labels across various dimensions.

```text
The Confusion Matrix:
                     Actual Positive      Actual Negative
                  +--------------------+--------------------+
Predicted Positive| True Positive (TP)  | False Positive (FP)| -> Precision = TP / (TP+FP)
                  +--------------------+--------------------+
Predicted Negative| False Negative (FN) | True Negative (TN) | -> Specificity = TN / (TN+FP)
                  +--------------------+--------------------+
                           |                     |
                           v                     v
                    Recall = TP / (TP+FN)   FPR = FP / (FP+TN)

ROC Curve (Receiver Operating Characteristic):
  TPR (Recall)
   1.0 |               *----*---* (Perfect Classifier AUC = 1.0)
       |            *  /
       |          *   /
       |        *    /  <-- Real Classifier Curve (e.g., AUC = 0.85)
       |      *     /
       |    *      /  <-- Random Guessing Diagonal (AUC = 0.5)
       |  *       /
   0.0 +_________/____________ FPR (False Positive Rate)
       0.0                  1.0
```

### 1. The Confusion Matrix and Core Metrics
At any fixed decision threshold (e.g., $0.5$), classification outcomes fall into one of four categories: True Positives (TP), False Positives (FP), False Negatives (FN), and True Negatives (TN). From these, we derive:

* **Precision (Positive Predictive Value)**: What proportion of predicted positives are truly positive? High precision is critical when the cost of a false positive is high.
  $$ \text{Precision} = \frac{\text{TP}}{\text{TP} + \text{FP}} $$

* **Recall (Sensitivity / True Positive Rate)**: What proportion of actual positives did the model detect? High recall is critical when missing a positive is catastrophic.
  $$ \text{Recall} = \text{TPR} = \frac{\text{TP}}{\text{TP} + \text{FN}} $$

* **F1-Score**: The harmonic mean of Precision and Recall, providing a single metric that balances both:
  $$ \text{F1} = 2 \cdot \frac{\text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}} = \frac{2\text{TP}}{2\text{TP} + \text{FP} + \text{FN}} $$

* **False Positive Rate (FPR)**: What proportion of actual negatives were incorrectly flagged as positive?
  $$ \text{FPR} = \frac{\text{FP}}{\text{FP} + \text{TN}} $$

### 2. ROC-AUC (Receiver Operating Characteristic)
While Precision, Recall, and F1 evaluate a model at a single operating threshold, the **ROC Curve** evaluates performance across all possible decision thresholds from $0.0$ to $1.0$. It plots the True Positive Rate (TPR) on the y-axis against the False Positive Rate (FPR) on the x-axis.

The **Area Under the Curve (AUC)** measures the probability that a classifier will rank a randomly chosen positive instance higher than a randomly chosen negative instance. 
* $\text{AUC} = 1.0$: Perfect class separation.
* $\text{AUC} = 0.5$: Classification performance equivalent to random guessing.

## Implementation

The following Python class calculates a comprehensive suite of binary classification metrics from scratch using NumPy, including Confusion Matrix components, Precision, Recall, F1, and a numerical estimation of ROC-AUC using the trapezoidal integration rule.

```python
import numpy as np
from typing import Dict, Tuple, List

class BinaryClassifierEvaluator:
    """
    Computes confusion matrices, threshold-specific metrics, 
    and ROC-AUC scores from raw prediction probabilities.
    """
    @staticmethod
    def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, int]:
        """
        Calculates TP, FP, FN, TN at a fixed classification threshold.
        """
        tp = int(np.sum((y_true == 1) & (y_pred == 1)))
        fp = int(np.sum((y_true == 0) & (y_pred == 1)))
        fn = int(np.sum((y_true == 1) & (y_pred == 0)))
        tn = int(np.sum((y_true == 0) & (y_pred == 0)))
        return {"TP": tp, "FP": fp, "FN": fn, "TN": tn}

    @staticmethod
    def calculate_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        """
        Calculates precision, recall, accuracy, and F1-score.
        """
        cm = BinaryClassifierEvaluator.confusion_matrix(y_true, y_pred)
        tp, fp, fn, tn = cm["TP"], cm["FP"], cm["FN"], cm["TN"]
        
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        f1 = 2.0 * (precision * recall) / (precision + recall) if (precision + recall) > 0 else 0.0
        accuracy = (tp + tn) / len(y_true)
        
        return {
            "Accuracy": accuracy,
            "Precision": precision,
            "Recall": recall,
            "F1-Score": f1
        }

    @staticmethod
    def compute_roc_auc(y_true: np.ndarray, y_probs: np.ndarray) -> Tuple[float, List[Tuple[float, float]]]:
        """
        Computes the Receiver Operating Characteristic curve and calculates 
        the Area Under the Curve (AUC) using trapezoidal numerical integration.
        """
        # Sort predictions and actual values descending by predicted probability
        desc_indices = np.argsort(y_probs)[::-1]
        sorted_probs = y_probs[desc_indices]
        sorted_true = y_true[desc_indices]
        
        # Unique thresholds to evaluate
        thresholds = np.unique(sorted_probs)
        roc_points: List[Tuple[float, float]] = [(0.0, 0.0)]
        
        num_positives = np.sum(sorted_true == 1)
        num_negatives = np.sum(sorted_true == 0)
        
        if num_positives == 0 or num_negatives == 0:
            raise ValueError("Input y_true must contain both positive and negative classes.")

        # Compute TPR and FPR for each threshold
        for threshold in thresholds:
            y_pred = (sorted_probs >= threshold).astype(int)
            tp = np.sum((sorted_true == 1) & (y_pred == 1))
            fp = np.sum((sorted_true == 0) & (y_pred == 1))
            
            tpr = tp / num_positives
            fpr = fp / num_negatives
            roc_points.append((fpr, tpr))
            
        roc_points.append((1.0, 1.0))
        # Sort points by FPR ascending for correct integration
        roc_points = sorted(roc_points, key=lambda x: x[0])
        
        # Calculate AUC using the trapezoidal rule
        auc = 0.0
        for i in range(1, len(roc_points)):
            fpr_prev, tpr_prev = roc_points[i-1]
            fpr_curr, tpr_tpr = roc_points[i]
            
            width = fpr_curr - fpr_prev
            avg_height = (tpr_prev + tpr_tpr) / 2.0
            auc += width * avg_height
            
        return auc, roc_points

if __name__ == "__main__":
    # Generate synthetic skewed ground truths and probabilities
    np.random.seed(42)
    labels = np.random.choice([0, 1], size=200, p=[0.85, 0.15]) # 15% positive class
    probabilities = np.random.rand(200)
    # Add correlated signal to positive probabilities
    probabilities[labels == 1] = np.clip(probabilities[labels == 1] + 0.35, 0, 1)

    # 1. Evaluate at default threshold of 0.5
    binary_predictions = (probabilities >= 0.5).astype(int)
    metrics = BinaryClassifierEvaluator.calculate_metrics(labels, binary_predictions)
    
    # 2. Compute ROC-AUC
    auc_score, curve_points = BinaryClassifierEvaluator.compute_roc_auc(labels, probabilities)
    
    print("--- Binary Classification Evaluation Results ---")
    print("Metrics at Threshold = 0.5:")
    for name, value in metrics.items():
        print(f"  {name:10s}: {value * 100:.2f}%")
        
    print(f"\nCalculated ROC-AUC Score: {auc_score:.5f}")
```

## System Constraints and Optimizations

Evaluating model metrics in large-scale production architectures presents key challenges:

1. **Precision-Recall Curve (PR-AUC) vs. ROC-AUC**: In scenarios with extreme class imbalance (e.g., ad click-through prediction where positive class < 0.01%), ROC-AUC can be overly optimistic. Because the number of actual negatives is massive, the False Positive Rate denominator remains very large, keeping FPR deceptively low even if the model predicts millions of false positives. Under these conditions, engineers prefer the **Precision-Recall (PR) Curve**, which focuses strictly on positive class performance.
2. **Online Metric Computation**: Calculating metrics across streaming, out-of-core prediction logs (billions of events per day) is computationally expensive. It is impossible to load all predictions into memory to sort and compute ROC-AUC. Production platforms use parallel metric frameworks, such as Apache Flink or Spark Streaming, to maintain rolling approximations of TP, FP, FN, and TN.
3. **Threshold Optimization Costs**: Operating thresholds should rarely be set to a static $0.5$ by default. The threshold must be tuned continuously by mapping performance metrics directly to business costs.

**Production Recommendation**: For imbalanced tabular tasks, prioritize F1-Score and PR-AUC over simple Accuracy. Continuously run slice-based evaluations to verify that model performance remains high across all key subpopulations and demographic segments.
