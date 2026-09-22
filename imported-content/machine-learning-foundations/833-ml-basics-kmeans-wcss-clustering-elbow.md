# Unsupervised Learning: K-Means Clustering and the Elbow Method

## The Problem
Enterprise systems often handle vast amounts of unlabeled data, such as customer behavioral logs, network traffic profiles, or product inventories. Without predefined target categories ($y$), supervised models are useless. 

Manual heuristics fail to extract meaning from multi-dimensional feature spaces, resulting in flat, unsophisticated customer grouping or missed anomaly clusters. To extract value, we need a mathematical model that can automatically discover intrinsic structures and group data points together purely based on feature similarity.

The core engineering challenge is to partition a multi-dimensional dataset into $K$ distinct, non-overlapping groups (clusters) such that data points within each group are highly similar, while points across different groups are highly distinct—all while selecting the optimal value of $K$ in a scientifically rigorous manner.

## Technical Architecture

K-Means is a centroid-based, iterative partitioning algorithm designed to minimize intra-cluster variance.

### Lloyd's Algorithm
The standard execution pipeline (Lloyd's algorithm) operates in three simple, repeating steps:

1. **Initialization**: Select $K$ initial points in the feature space to act as cluster centers (centroids) $\mu_1, \mu_2, \dots, \mu_K$.
2. **Assignment Step**: Assign each observation $x_i$ to its nearest centroid. This partitions the space into Voronoi cells:
   $$ S_j^{(t)} = \left\{ x_i : \| x_i - \mu_j^{(t)} \|^2 \le \| x_i - \mu_{j^*}^{(t)} \|^2 \quad \forall j^*, 1 \le j^* \le K \right\} $$
   Where $\| \cdot \|^2$ represents the squared Euclidean distance.
3. **Update Step**: Recalculate the position of each centroid $\mu_j$ by computing the mean of all points assigned to that cluster:
   $$ \mu_j^{(t+1)} = \frac{1}{|S_j^{(t)}|} \sum_{x_i \in S_j^{(t)}} x_i $$

Repeat steps 2 and 3 until centroid coordinates stabilize (convergence).

```text
Centroid Movement and Voronoi Partitioning
     
      x    x                   x    x                   x    x  
    x  [M1]  x               x       x               x  (M1)   x 
      x   x                    x   x                    x   x    
-----------------  ===>  -----------------  ===>  -----------------
        x  x                    x  x                    x  x     
     x  [M2]  x              x  (M2)  x              x       x   
       x   x                    x   x                  (M2) x    
  (Iteration 1)          (Centroid Shifts)         (Convergence)
  [M] = Initial Centroid    (M) = Updated Centroid
```

### The Selection Metric: Within-Cluster Sum of Squares (WCSS)
To evaluate the mathematical quality of a clustering layout, we calculate the Within-Cluster Sum of Squares (WCSS), also known as **Inertia**:

$$ WCSS = \sum_{j=1}^{K} \sum_{x_i \in S_j} \| x_i - \mu_j \|^2 $$

### Choosing K: The Elbow Method
As $K$ increases, WCSS naturally decreases (if $K=m$, WCSS is $0$). To identify the optimal $K$, we plot WCSS against a range of cluster counts. The curve typically forms an "elbow" or inflection point. The point where the rate of WCSS reduction sharply flattens indicates that adding more clusters yields diminishing returns.

```text
WCSS (Inertia)
  ^
  |  * (K=1)
  |   \
  |    \
  |     * (K=2)
  |      \
  |       * (K=3) <--- Optimal "Elbow" Point
  |        \________* (K=4)
  |                  \________* (K=5)
  +-------------------------------------> Number of Clusters (K)
```

## Implementation

The following scratch implementation of K-Means demonstrates distance calculation, centroid reassignment, and WCSS computation.

```python
import numpy as np
from typing import Tuple, Dict

class CustomKMeans:
    def __init__(self, k: int = 3, max_iter: int = 100, tol: float = 1e-4) -> None:
        self.k: int = k
        self.max_iter: int = max_iter
        self.tol: float = tol
        self.centroids: np.ndarray = None
        self.inertia_: float = 0.0

    def fit(self, X: np.ndarray) -> 'CustomKMeans':
        """
        Fits K-Means using Lloyd's algorithm.
        """
        n_samples, n_features = X.shape
        
        # Step 1: Initialize centroids randomly from existing points (Forgy method)
        random_indices = np.random.choice(n_samples, self.k, replace=False)
        self.centroids = X[random_indices].copy()

        for iteration in range(self.max_iter):
            # Step 2: Assignment step
            # Calculate Euclidean distance from every point to all k centroids: shape (m, k)
            distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
            labels = np.argmin(distances, axis=1)

            # Keep track of old centroids to check tolerance/convergence
            old_centroids = self.centroids.copy()

            # Step 3: Update step (Calculate mean of points in each cluster)
            for j in range(self.k):
                cluster_points = X[labels == j]
                if len(cluster_points) > 0:
                    self.centroids[j] = np.mean(cluster_points, axis=0)
                else:
                    # Handle empty cluster: re-initialize with random sample
                    self.centroids[j] = X[np.random.choice(n_samples)]

            # Check convergence
            centroid_shift = np.sum((self.centroids - old_centroids) ** 2)
            if centroid_shift < self.tol:
                break

        # Calculate final Inertia (WCSS)
        final_distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
        min_distances = np.min(final_distances, axis=1)
        self.inertia_ = float(np.sum(min_distances ** 2))

        return self

    def predict(self, X: np.ndarray) -> np.ndarray:
        """
        Predicts closest cluster index for each sample.
        """
        distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
        return np.argmin(distances, axis=1)

if __name__ == "__main__":
    from sklearn.datasets import make_blobs

    # Generate synthetic 2D isotropic Gaussian blobs
    X, _ = make_blobs(n_samples=300, centers=4, cluster_std=0.60, random_state=42)

    # Test custom K-Means for k=4
    kmeans = CustomKMeans(k=4)
    kmeans.fit(X)
    print(f"--- Fit complete for K=4 ---")
    print(f"Inertia (WCSS): {kmeans.inertia_:.4f}")
    print(f"Calculated Centroids:\n{kmeans.centroids}")

    # Simulating Elbow Method to find optimal K
    print("\n--- Simulating Elbow Evaluation ---")
    for k_val in range(1, 6):
        km = CustomKMeans(k=k_val)
        km.fit(X)
        print(f"K = {k_val} | WCSS (Inertia) = {km.inertia_:.4f}")
```

## System Constraints and Optimizations
K-Means is incredibly fast ($O(t \cdot K \cdot m \cdot n)$), but has several critical design assumptions that developers must account for:

1. **Feature Scaling Sensitivity**: Because K-Means utilizes Euclidean distance, variables with larger numerical ranges will completely dominate the distance calculations. **Always standardize features** ($\mu=0, \sigma=1$) before fitting.
2. **K-Means++ Initialization**: Random Forgy initialization can lead to highly suboptimal local minima if two centroids start close to each other. In production, utilize **K-Means++**, which initializes centroids sequentially, picking the next centroid with a probability proportional to the squared distance from the closest existing centroid.
3. **Geometry Assumptions**: K-Means assumes spherical clusters of equal size (variance). It fails spectacularly on elongated, non-convex, or concentric layouts (e.g., moons, rings). In those cases, switch to density-based algorithms like DBSCAN or manifold methods like Spectral Clustering.
