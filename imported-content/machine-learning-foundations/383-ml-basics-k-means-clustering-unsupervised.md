# Unsupervised Learning: K-Means Clustering and the Elbow Method

In data engineering and analytics, we are frequently faced with large volumes of unlabeled data. We want to discover hidden patterns, categorize system behaviors, or group users into cohorts. Unsupervised learning solves this by clustering data points without explicit target labels. **K-Means** is the most widely adopted clustering algorithm due to its simplicity and computational efficiency. However, K-Means requires you to predefine the number of clusters ($K$). Selecting this parameter arbitrarily leads to poor groupings, which developers resolve using the mathematical **Elbow Method**.

---

## The Problem: Unsupervised Partitioning and Cluster Optimization

Given a high-dimensional dataset $X$, how do we divide it into $K$ coherent groups?
1. **Mathematical Partitioning:** We want points in the same cluster to be as close to each other as possible, and points in different clusters to be as far apart as possible.
2. **Selecting $K$:** If we set $K$ too low, we group distinct behaviors together, hiding valuable signals. If we set $K$ too high, we over-segment the data, essentially fitting centroids to individual noise. Since there are no ground-truth labels, we need a mathematical heuristic to balance compression and accuracy.

---

## Technical Architecture and Clustering Mechanics

The K-Means algorithm relies on an expectation-maximization heuristic that alternates between point assignment and centroid optimization.

```
          [ Start: Choose K ]
                  |
                  v
       [ Step 1: Assign Points ] ---> (Closest Centroid: argmin ||x - μ_k||^2)
                  ^                          |
                  |                          v
                  +----------------- [ Step 2: Recalculate Centroids ]
                                        (Mean of assigned points)
                                             |
                                             v
                                      [ Converged? ]
                                      (Centroids stable)
                                             | Yes
                                             v
                                           [ End ]
```

### 1. Within-Cluster Sum of Squares (WCSS / Inertia)
We measure the quality of our clustering using the Within-Cluster Sum of Squares (WCSS), which computes the sum of squared Euclidean distances between each point and its assigned centroid:

$$J = \sum_{k=1}^K \sum_{i \in S_k} \| x_i - \mu_k \|^2$$

where $S_k$ is the set of data points assigned to cluster centroid $\mu_k$.

### 2. Centroid Update Formula
During the update phase, the centroid position $\mu_k$ is moved to the exact mean of all points currently assigned to it:

$$\mu_k = \frac{1}{|S_k|} \sum_{i \in S_k} x_i$$

### 3. The Elbow Method
As $K$ increases, WCSS naturally decreases (if $K=N$, WCSS is 0). To find the optimal $K$, we plot WCSS against $K$. The curve typically drops sharply at first and then flattens out, forming an "elbow." The value of $K$ at this inflection point represents the optimal trade-off between clustering resolution and computational simplicity.

---

## Complete Vectorized NumPy Implementation

Below is a complete, vectorized implementation of K-Means clustering and WCSS evaluation from scratch.

```python
import numpy as np

class KMeansScratch:
    def __init__(self, k: int = 3, max_iters: int = 100, tol: float = 1e-4):
        self.k = k
        self.max_iters = max_iters
        self.tol = tol
        self.centroids = None
        self.labels = None
        self.inertia_ = None  # WCSS value

    def fit(self, X: np.ndarray):
        n_samples, n_features = X.shape

        # 1. Initialize centroids randomly from the dataset
        random_idx = np.random.choice(n_samples, size=self.k, replace=False)
        self.centroids = X[random_idx].copy()

        for iteration in range(self.max_iters):
            # 2. Assign Points (Vectorized distance calculation)
            # Distances: shape (n_samples, k)
            distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
            self.labels = np.argmin(distances, axis=1)

            # 3. Recalculate Centroids
            old_centroids = self.centroids.copy()
            for cluster_idx in range(self.k):
                points_in_cluster = X[self.labels == cluster_idx]
                if len(points_in_cluster) > 0:
                    self.centroids[cluster_idx] = np.mean(points_in_cluster, axis=0)

            # 4. Check Convergence
            centroid_shift = np.sum(np.linalg.norm(old_centroids - self.centroids, axis=1))
            if centroid_shift < self.tol:
                break

        # 5. Compute WCSS (Inertia)
        self.inertia_ = 0.0
        for cluster_idx in range(self.k):
            points_in_cluster = X[self.labels == cluster_idx]
            if len(points_in_cluster) > 0:
                self.inertia_ += np.sum((points_in_cluster - self.centroids[cluster_idx]) ** 2)

    def predict(self, X: np.ndarray) -> np.ndarray:
        distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
        return np.argmin(distances, axis=1)
```

---

## Developer Takeaways

* **Standardization is Mandatory:** K-Means uses Euclidean distance as its similarity metric. If one feature ranges from $0$ to $10,000$ (e.g., salary) and another from $0$ to $5$ (e.g., rating), the distance metric will be completely dominated by the first feature. Always apply standard scaling ($z$-score) before clustering.
* **Initialization Sensitivity:** Standard K-Means is highly sensitive to initial centroid placement, which can cause the algorithm to converge on poor local minima. Modern production systems use **K-Means++**, which initializes centroids to be far apart from each other.
* **Limit Dimensions:** In extremely high dimensions, Euclidean distances become uniform (the "curse of dimensionality"). Run a dimensionality reduction step (such as PCA or t-SNE) before clustering.
