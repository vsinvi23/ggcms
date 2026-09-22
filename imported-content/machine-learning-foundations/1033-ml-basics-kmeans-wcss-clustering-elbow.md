# Unsupervised Learning: K-Means Clustering and the Elbow Method

## The Problem
In real-world data engineering workloads, labels are frequently missing, incomplete, or prohibitively expensive to collect. Use cases like user cohort segmentation, cloud resource anomaly detection, and network traffic clustering require partitioning unlabeled multi-dimensional data into distinct, coherent groups. 

The primary engineering goal is to construct a system that organizes samples so that data points in the same group are highly similar, while points in different groups are mathematically separated. Additionally, because the optimal number of groups ($K$) is rarely known beforehand, we must establish a repeatable, mathematically rigorous method for determining the optimal cluster count to avoid arbitrary manual overrides or excessive model complexity.

## Technical Architecture

K-Means clustering is an iterative partition-based algorithm that divides a dataset $X \in \mathbb{R}^{m \times n}$ into $K$ disjoint subsets.

### 1. Within-Cluster Sum of Squares (WCSS)
K-Means optimizes a loss function known as the **Within-Cluster Sum of Squares (WCSS)** or **Inertia**. WCSS measures the sum of squared Euclidean distances between each data point $x^{(i)}$ and its assigned cluster representative centroid $\mu_k$:

$$ \text{WCSS} = \sum_{k=1}^{K} \sum_{i \in C_k} \| x^{(i)} - \mu_k \|^2 $$

Where $C_k$ is the set of indices belonging to cluster $k$, and $\mu_k \in \mathbb{R}^n$ is the centroid of cluster $k$.

### 2. Lloyd's Algorithm (Iterative Minimization)
Since finding the global minimum of the WCSS objective is an NP-hard problem, we use Lloyd's expectation-maximization heuristic, which guarantees convergence to a local minimum through two alternating steps:

* **Step A: Assignment (Expectation)**: Assign each sample $x^{(i)}$ to its closest centroid based on the minimum squared Euclidean distance:
  $$ c^{(i)} := \arg\min_{k \in \{1,\dots,K\}} \| x^{(i)} - \mu_k \|^2 $$
  
* **Step B: Update (Maximization)**: Recompute each centroid $\mu_k$ as the mean of all points assigned to that cluster:
  $$ \mu_k := \frac{1}{|C_k|} \sum_{i \in C_k} x^{(i)} $$

These steps are repeated until centroid positions stabilize (under a small tolerance value $\epsilon$) or the maximum number of iterations is reached.

### 3. The Elbow Method
To find the optimal $K$, the model is trained across a range of $K$ values (e.g., $1$ to $10$). We plot WCSS against $K$. As $K$ increases, WCSS naturally decreases (reaching $0$ when $K=m$). The optimal cluster count is represented by the "elbow"—the inflection point where the rate of WCSS decrease drops significantly, indicating diminishing returns for adding more clusters.

```text
Iteration 0 (Random Centroids):
   x        * (Centroid 1)      x
       x                  x
             x    * (Centroid 2)

Iteration 1 (Assign & Recompute):
  [x   x]                  [x   x]
     \                        /
      * (New Centroid 1)     * (New Centroid 2)

Elbow Curve for Optimal K Selection:
  WCSS
   |
   | \
   |  \
   |   \
   |    * <-- "Elbow" Point (Optimal K = 3)
   |     \
   |______*_______*______ K
   0      3       5      10
```

## Implementation

The following is a robust Python implementation of K-Means clustering from scratch, showing centroid assignment, update, WCSS calculation, and iterative fitting.

```python
import numpy as np
from typing import Tuple, List

class KMeansScratch:
    """
    K-Means clustering algorithm built using NumPy vectorization.
    """
    def __init__(self, K: int = 3, max_iter: int = 300, tolerance: float = 1e-4) -> None:
        self.K: int = K
        self.max_iter: int = max_iter
        self.tolerance: float = tolerance
        self.centroids: np.ndarray = None
        self.labels: np.ndarray = None
        self.inertia_: float = 0.0 # WCSS value

    def _compute_distances(self, X: np.ndarray) -> np.ndarray:
        """
        Computes the Euclidean distance from each sample to all centroids.
        Returns matrix of shape (m, K).
        """
        m = X.shape[0]
        distances = np.zeros((m, self.K))
        for k in range(self.K):
            distances[:, k] = np.linalg.norm(X - self.centroids[k], axis=1)
        return distances

    def fit(self, X: np.ndarray) -> 'KMeansScratch':
        """
        Fits centroids and cluster labels to the dataset.
        """
        m, n = X.shape
        # Initialize centroids randomly from existing training samples
        random_indices = np.random.choice(m, self.K, replace=False)
        self.centroids = X[random_indices].copy()
        
        for iteration in range(self.max_iter):
            # Step A: Distance calculation & Assignment
            distances = self._compute_distances(X)
            new_labels = np.argmin(distances, axis=1)
            
            # Step B: Centroid update
            old_centroids = self.centroids.copy()
            for k in range(self.K):
                assigned_points = X[new_labels == k]
                if len(assigned_points) > 0:
                    self.centroids[k] = np.mean(assigned_points, axis=0)
                else:
                    # Re-initialize empty cluster centroid to a random sample
                    self.centroids[k] = X[np.random.choice(m)]
            
            # Check for convergence
            centroid_shift = np.sum(np.linalg.norm(self.centroids - old_centroids, axis=1))
            if centroid_shift < self.tolerance:
                break
                
        self.labels = new_labels
        # Calculate final WCSS (Inertia)
        distances = self._compute_distances(X)
        self.inertia_ = float(np.sum(np.min(distances, axis=1) ** 2))
        return self

if __name__ == "__main__":
    # Generate isotropic Gaussian blobs for validation
    from sklearn.datasets import make_blobs
    X_data, _ = make_blobs(n_samples=300, n_features=2, centers=3, cluster_std=0.6, random_state=42)

    # Perform Elbow Method Analysis
    print("--- Running K-Means Elbow Diagnostics ---")
    k_values = range(1, 7)
    wcss_scores: List[float] = []
    
    for k in k_values:
        kmeans = KMeansScratch(K=k, max_iter=150)
        kmeans.fit(X_data)
        wcss_scores.append(kmeans.inertia_)
        print(f"K = {k} | WCSS (Inertia): {kmeans.inertia_:.4f}")

    # Validate that WCSS decreases as K increases
    assert all(wcss_scores[i] >= wcss_scores[i+1] for i in range(len(wcss_scores)-1))
```

## System Constraints and Optimizations

Implementing K-Means in high-throughput clusters reveals three major operational bottlenecks:

1. **Initialization Sensitivity**: Lloyd's algorithm is highly sensitive to the initial, random centroid selections, occasionally trapping it in sub-optimal local minima. Production platforms mitigate this by using **K-Means++**, an initialization algorithm that selects centroids sequentially by sampling points with probabilities proportional to their squared distance from the closest existing centroid.
2. **Computational Complexity**: Computing exact pairwise Euclidean distances across every point and centroid scales as $O(\text{iterations} \times K \times m \times n)$. For billions of samples, this becomes a major bottleneck. **Mini-Batch K-Means** resolves this by computing updates on randomized sub-samples of the dataset.
3. **The Curse of Dimensionality**: In extremely high-dimensional spaces (e.g., $n > 500$), the ratio of distances between the nearest and farthest neighbors approaches 1, meaning Euclidean metric values become nearly uniform and lose clustering signal.

**Production Recommendation**: Always standardize feature metrics before running K-Means to ensure features with wider scales do not dominate distance measurements. If the feature space is high-dimensional, apply Principal Component Analysis (PCA) or t-SNE to reduce the dimensional space before clustering.
