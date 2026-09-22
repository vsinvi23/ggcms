# Unsupervised Learning: K-Means Clustering and the Elbow Method

## The Problem
In real-world data engineering and machine learning workflows, a significant portion of incoming data lacks pre-labeled targets. Organizations must categorize user behaviors, detect network anomalies, or structure product catalogs without prior labels. Unsupervised clustering is required to discover natural groupings within these unlabeled multi-dimensional datasets. 

The immediate technical hurdles are: defining an objective function that guarantees mathematical convergence, executing centroid optimization without infinite looping, and resolving the optimal number of clusters ($K$) systematically rather than relying on qualitative guesses.

## Technical Architecture

K-Means is a centroid-based, iterative clustering algorithm that partitions $m$ samples into $K$ distinct, non-overlapping subgroups.

### 1. The Optimization Objective: Within-Cluster Sum of Squares (WCSS)
K-Means aims to minimize the sum of squared Euclidean distances between each data point and its assigned cluster centroid. This objective is known as WCSS or **Inertia**:

$$ J(c, \mu) = \sum_{i=1}^{m} \| x^{(i)} - \mu_{c^{(i)}} \|^2 $$

Where:
* $x^{(i)} \in \mathbb{R}^n$ is the $i$-th data point.
* $c^{(i)} \in \{1, \dots, K\}$ is the index of the cluster centroid assigned to $x^{(i)}$.
* $\mu_j \in \mathbb{R}^n$ is the centroid of cluster $j$.

### 2. The Expectation-Maximization (EM) Algorithm
The objective $J(c, \mu)$ is non-convex and NP-hard to minimize globally. K-Means uses an iterative expectation-maximization heuristic:

* **Expectation (Assignment Step)**: Hold centroids $\mu$ fixed and assign each data point $x^{(i)}$ to its closest centroid:

$$ c^{(i)} \leftarrow \arg\min_{j} \| x^{(i)} - \mu_j \|^2 $$

* **Maximization (Update Step)**: Hold assignments $c$ fixed and recompute each centroid $\mu_j$ as the mean of all points assigned to that cluster:

$$ \mu_j \leftarrow \frac{1}{|S_j|} \sum_{i \in S_j} x^{(i)} $$

where $S_j = \{ i : c^{(i)} = j \}$ is the subset of sample indices assigned to cluster $j$. These steps repeat until assignments stop changing (convergence).

### 3. The Elbow Method
To find the optimal hyperparameter $K$, we run K-Means across a range of values (e.g., $K \in [1, 10]$) and plot WCSS vs. $K$. As $K$ increases, WCSS naturally decreases. The "elbow" point represents the value of $K$ where the rate of decrease in WCSS slows down significantly, signaling that adding more clusters yields diminishing returns.

```text
    Expectation Step                     Maximization Step                    The Elbow Method
+-----------------------+            +-----------------------+           WCSS |
| Assign points to      |            | Recalculate centroids |                | *
| nearest centroid      |            | as average of cluster |                |  *
| c^(i) = argmin ||d||  |            | points                |                |   *
+-----------------------+            +-----------------------+                |    * (Elbow Point: Optimal K)
            ^                                    |                            |     \______
            |                                    v                            |            ********
            +------------------------------------+                            +-----------------------
                     (Iterate until convergence)                                               K (Clusters)
```

## Implementation

The following code is a high-performance, vectorized NumPy implementation of K-Means clustering. It includes multiple random initializations to reduce the risk of settling in local minima.

```python
import numpy as np
from typing import Tuple

class KMeansClustering:
    def __init__(self, K: int = 3, max_iters: int = 300, n_init: int = 10) -> None:
        self.K: int = K
        self.max_iters: int = max_iters
        self.n_init: int = n_init
        self.centroids: np.ndarray = None
        self.labels: np.ndarray = None
        self.inertia_: float = np.inf

    def _initialize_centroids(self, X: np.ndarray) -> np.ndarray:
        m, n = X.shape
        # Standard random initialization
        indices = np.random.choice(m, size=self.K, replace=False)
        return X[indices]

    def _fit_single(self, X: np.ndarray) -> Tuple[np.ndarray, np.ndarray, float]:
        m = X.shape[0]
        centroids = self._initialize_centroids(X)
        labels = np.zeros(m, dtype=int)
        
        for _ in range(self.max_iters):
            # Expectation step: Vectorized calculation of distance to centroids
            # Shape: (m, K)
            distances = np.linalg.norm(X[:, np.newaxis] - centroids, axis=2)
            new_labels = np.argmin(distances, axis=1)
            
            # Check for convergence
            if np.array_equal(labels, new_labels):
                break
            labels = new_labels
            
            # Maximization step: Recompute centroids
            new_centroids = np.zeros_like(centroids)
            for j in range(self.K):
                cluster_points = X[labels == j]
                if len(cluster_points) > 0:
                    new_centroids[j] = np.mean(cluster_points, axis=0)
                else:
                    # Handle empty cluster by reinitializing centroid randomly
                    new_centroids[j] = X[np.random.choice(m)]
            centroids = new_centroids

        # Calculate WCSS/Inertia for this run
        distances = np.linalg.norm(X[:, np.newaxis] - centroids, axis=2)
        inertia = float(np.sum(np.min(distances, axis=1) ** 2))
        return centroids, labels, inertia

    def fit(self, X: np.ndarray) -> 'KMeansClustering':
        best_inertia = np.inf
        best_centroids = None
        best_labels = None
        
        # Run multiple initializations to avoid local minima
        for _ in range(self.n_init):
            centroids, labels, inertia = self._fit_single(X)
            if inertia < best_inertia:
                best_inertia = inertia
                best_centroids = centroids
                best_labels = labels
                
        self.centroids = best_centroids
        self.labels = best_labels
        self.inertia_ = best_inertia
        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        if self.centroids is None:
            raise ValueError("Model is not fitted yet.")
        distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
        return np.argmin(distances, axis=1)

if __name__ == "__main__":
    # Generate 3 synthetic Gaussian blobs in 2D space
    np.random.seed(42)
    blob1 = np.random.randn(100, 2) + np.array([4.0, 4.0])
    blob2 = np.random.randn(100, 2) + np.array([-4.0, -4.0])
    blob3 = np.random.randn(100, 2) + np.array([4.0, -4.0])
    X_train = np.vstack([blob1, blob2, blob3])

    # Fit K-Means
    kmeans = KMeansClustering(K=3, n_init=15)
    kmeans.fit(X_train)

    print("--- K-Means Clustering Results ---")
    print(f"Optimal Centroids Found:\n{kmeans.centroids}")
    print(f"Within-Cluster Sum of Squares (Inertia): {kmeans.inertia_:.4f}")
    
    # Run Elbow analysis simulation
    elbow_scores = []
    for k in range(1, 6):
        km = KMeansClustering(K=k, n_init=5)
        km.fit(X_train)
        elbow_scores.append((k, km.inertia_))
    
    print("\nInertia for Elbow Method analysis:")
    for k, score in elbow_scores:
         print(f"K = {k}: WCSS = {score:.4f}")
```

## System Constraints and Optimizations
Designing clustering pipelines requires managing specific physical constraints:

1. **Local Minima Sensitivity**: K-Means is guaranteed to converge, but because the WCSS objective is non-convex, it often lands in local minima depending on initial centroid choices. Running multiple initializations (`n_init` parameter) or using K-Means++ is a necessary production safeguard.
2. **Euclidean Scaling Distortion**: K-Means calculates raw geometric distances. If one feature has a range of $[0, 10000]$ (e.g., salary) and another has a range of $[0, 1]$ (e.g., age), the first feature will dominate the distance calculations completely. Pre-scaling is mandatory.
3. **Spherical Geometry Assumption**: K-Means assumes spherical cluster profiles. It performs poorly on complex patterns like crescent shapes, concentric circles, or variable density structures.

**Production Recommendation**: Always apply standardization (z-score normalization) to features before feeding them to K-Means. If data clusters exhibit complex geometries, consider switching to density-based algorithms like DBSCAN or manifold learning techniques.
