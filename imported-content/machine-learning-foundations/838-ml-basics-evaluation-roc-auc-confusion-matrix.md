# Evaluating ML Models: Precision, Recall, F1-Score, and ROC-AUC

## The Problem
A major anti-pattern in machine learning development is relying solely on raw **classification accuracy** to evaluate model performance. On highly imbalanced datasets—such as credit card fraud detection (99.9% normal, 0.1% fraud) or rare medical diagnoses—raw accuracy is a dangerous illusion. 

A naive classifier that is hard-coded to predict "normal" for every input will easily achieve 99.9% accuracy. However, this model is completely useless; it fails to catch a single fraudulent transaction or disease vector, resulting in severe financial or life-threatening damage. 

To build safe, reliable, and well-calibrated production systems, software engineers must utilize a holistic evaluation suite that isolates prediction errors from class distribution skew.

## Technical Architecture

To assess a model's true predictive capabilities, we categorize all individual classifications into a 2x2 grid called the **Confusion Matrix**.

```text
                  Confusion Matrix Grid Layout
                       Actual Positive         Actual Negative
                  +-----------------------+-----------------------+
Prediction Positive|   True Positive (TP)  |  False Positive (FP)  |
                   |   (Correct Alert)     |    (False Alarm)      |
                  +-----------------------+-----------------------+
Prediction Negative|  False Negative (FN)  |   True Negative (TN)  |
                   |     (Missed Event)    |  (Correct Rejection)  |
                  +-----------------------+-----------------------+
```

From these four values, we derive four core performance metrics:

1. **Accuracy**: The ratio of correct predictions to total samples. Highly sensitive to class imbalance.
   $$ \text{Accuracy} = \frac{TP + TN}{TP + TN + FP + FN} $$

2. **Precision**: Out of all predicted positive cases, what percentage were actually positive? This measures the cost of *false alarms* (False Positives).
   $$ \text{Precision} = \frac{TP}{TP + FP} $$

3. **Recall (Sensitivity)**: Out of all actual positive cases, what percentage did the model capture? This measures the cost of *missed events* (False Negatives).
   $$ \text{Recall} = \frac{TP}{TP + FN} $$

4. **F1-Score**: The harmonic mean of Precision and Recall, providing a single balanced metric for model comparison:
   $$ F1 = 2 \cdot \frac{\text{Precision} \cdot \text{Recall}}{\text{Precision} + \text{Recall}} $$

### ROC Curve and AUC
To evaluate a model independent of a specific decision threshold (e.g., $0.5$), we plot the **Receiver Operating Characteristic (ROC) Curve**. The ROC curve plots the **True Positive Rate (TPR)** against the **False Positive Rate (FPR)** across all possible probability thresholds in $[0, 1]$:

$$ \text{TPR (Recall)} = \frac{TP}{TP + FN} \quad \text{and} \quad \text{FPR} = \frac{FP}{FP + TN} $$

```text
                       The ROC Curve Chart
  TPR (Recall)
    1.0 +----------------------------------------------#---
        |                                        ######|
        |                                  ######      |
        |                             #####            |
        |                        #####                 |  (A perfect model has AUC = 1.0)
        |                   #####                      |  (Random guessing has AUC = 0.5)
        |              #####                           |
        |         #####                                |
    0.0 +---######-------------------------------------+
       0.0                                            1.0  FPR
```

The **Area Under the Curve (ROC-AUC)** measures the probability that a model will rank a randomly chosen positive sample higher than a randomly chosen negative sample. A score of $1.0$ represents a perfect classifier, while $0.5$ represents a random-guessing baseline.

## Implementation

The following complete Python script computes the Confusion Matrix, Precision, Recall, F1-Score, and estimates the ROC-AUC score from scratch using pure NumPy.

```python
import numpy as np
from typing import Tuple, Dict, List

class ModelEvaluator:
    @staticmethod
    def confusion_matrix(y_true: np.ndarray, y_pred: np.ndarray) -> np.ndarray:
        """
        Computes the 2x2 confusion matrix.
        Returns:
            np.ndarray of shape (2, 2) structured as [[TP, FP], [FN, TN]]
        """
        tp = np.sum((y_true == 1) & (y_pred == 1))
        fp = np.sum((y_true == 0) & (y_pred == 1))
        fn = np.sum((y_true == 1) & (y_pred == 0))
        tn = np.sum((y_true == 0) & (y_pred == 0))
        return np.array([[tp, fp], [fn, tn]])

    @classmethod
    def evaluate_metrics(cls, y_true: np.ndarray, y_pred: np.ndarray) -> Dict[str, float]:
        """
        Calculates accuracy, precision, recall, and F1-score from predicted classes.
        """
        matrix = cls.confusion_matrix(y_true, y_pred)
        tp, fp = matrix[0, 0], matrix[0, 1]
        fn, tn = matrix[1, 0], matrix[1, 1]

        accuracy = (tp + tn) / (tp + tn + fp + fn) if (tp + tn + fp + fn) > 0 else 0.0
        precision = tp / (tp + fp) if (tp + fp) > 0 else 0.0
        recall = tp / (tp + fn) if (tp + fn) > 0 else 0.0
        
        if (precision + recall) > 0:
            f1 = 2 * (precision * recall) / (precision + recall)
        else:
            f1 = 0.0

        return {
            "accuracy": float(accuracy),
            "precision": float(precision),
            "recall": float(recall),
            "f1_score": float(f1)
        }

    @staticmethod
    def calculate_auc(y_true: np.ndarray, y_prob: np.ndarray) -> float:
        """
        Calculates Area Under the ROC Curve (ROC-AUC) using Mann-Whitney U statistic.
        This represents the probability that a random positive is ranked higher than a random negative.
        """
        # Isolate probabilities for true positives and true negatives
        positives = y_prob[y_true == 1]
        negatives = y_prob[y_true == 0]
        
        if len(positives) == 0 or len(negatives) == 0:
            return 0.5
            
        # Count pairs where positive score > negative score
        # Using broadcasting to compare all pairs: shape (len_pos, len_neg)
        pairwise_comparison = positives[:, np.newaxis] > negatives
        equal_comparison = positives[:, np.newaxis] == negatives
        
        # Mann-Whitney U score equivalents: 1 point for strictly greater, 0.5 for tie
        auc = (np.sum(pairwise_comparison) + 0.5 * np.sum(equal_comparison)) / (len(positives) * len(negatives))
        return float(auc)

if __name__ == "__main__":
    # Generate imbalanced target labels (e.g. 10 positives, 90 negatives)
    np.random.seed(42)
    y_true = np.concatenate([np.ones(10), np.zeros(90)])
    
    # Generate continuous predicted probabilities
    y_prob = np.random.rand(100)
    # Give true positives slightly higher scores to simulate a working model
    y_prob[y_true == 1] += 0.3
    y_prob = np.clip(y_prob, 0.0, 1.0)
    
    # Classify based on a standard 0.5 probability threshold
    y_pred = (y_prob >= 0.5).astype(int)

    # Run evaluations
    metrics = ModelEvaluator.evaluate_metrics(y_true, y_pred)
    auc_score = ModelEvaluator.calculate_auc(y_true, y_prob)

    print("--- Imbalanced Dataset Model Evaluation ---")
    print(f"Confusion Matrix (TP, FP, FN, TN):\n{ModelEvaluator.confusion_matrix(y_true, y_pred)}")
    print(f"Accuracy:  {metrics['accuracy']:.4f} (Can be misleadingly high)")
    print(f"Precision: {metrics['precision']:.4f} (Alert accuracy)")
    print(f"Recall:    {metrics['recall']:.4f} (Detection rate)")
    print(f"F1-Score:  {metrics['f1_score']:.4f} (Harmonic balance)")
    print(f"ROC-AUC:   {auc_score:.4f} (Overall ranking power)")
```

## System Constraints and Optimizations
Selecting decision thresholds in production is a strategic trade-off dictated by real-world costs:

1. **The Precision-Recall Tradeoff**: If you increase the classification threshold (e.g., to $0.8$), Precision increases (fewer false alarms) but Recall decreases (more missed events). Conversely, lowering the threshold to $0.2$ boosts Recall (catches everything) but decreases Precision.
2. **Domain-Specific Threshold Tuning**:
   - **Cancer Screening**: Prioritize **Recall**. A False Positive leads to a harmless secondary screen, but a False Negative (missed cancer) is catastrophic. Set a low threshold (e.g., $0.15$).
   - **Email Spam Filtering**: Prioritize **Precision**. Users accept occasional spam in their inbox (False Negative), but are furious if critical client emails are sent to the spam folder (False Positive). Set a high threshold (e.g., $0.85$).
3. **Threshold Calibration**: To ensure that predicted probabilities ($y_{prob}$) match real-world frequencies (e.g., that a predicted probability of $0.8$ actually maps to an $80\%$ chance of occurrence), deploy calibration layers such as Platt Scaling or Isotonic Regression.
