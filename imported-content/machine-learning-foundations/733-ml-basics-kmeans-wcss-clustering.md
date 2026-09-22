# Unsupervised Learning: K-Means Clustering and the Elbow Method

## The Problem
When operating on unlabelled datasets (e.g., customer segmentation, anomaly detection, image compression), there is no target variable $y$ to predict. The engineering objective shifts from prediction to structure discovery. We need an algorithmic approach to group $m$ observations into $K$ distinct clusters such that intra-cluster variance is minimized, revealing inherent latent structures in the feature space without human supervision.

## Technical Architecture

K-Means is a centroid-based clustering algorithm. It partitions the feature space into Voronoi cells by iteratively updating $K$ centroids ($\mu$) to minimize the Within-Cluster Sum of Squares (WCSS).

### The Objective Function (Inertia / WCSS)
Let $S_k$ be the set of points assigned to the $k$-th cluster, and $\mu_k$ be the mean vector of $S_k$. The objective is to minimize:

$$ \text{WCSS} = \sum_{k=1}^{K} \sum_{x \in S_k} || x - \mu_k ||^2 $$

### Lloyd's Algorithm
K-Means typically uses Lloyd's algorithm, an Expectation-Maximization (EM) approach:
1. **Initialization:** Randomly select $K$ points as initial centroids.
2. **Assignment (E-step):** Assign each observation $x_i$ to the nearest centroid based on squared Euclidean distance.
3. **Update (M-step):** Recompute each centroid $\mu_k$ as the mean of all points in $S_k$.
4. **Convergence:** Repeat steps 2 and 3 until centroids stabilize (WCSS stops decreasing).

```text
+-------------------+      +--------------------+      +--------------------+
| Initialize K      | ---> | Assign Points to   | ---> | Calculate New      |
| Centroids (Random)|      | Nearest Centroid   |      | Centroids (Means)  |
+-------------------+      +--------------------+      +--------------------+
                                 ^                              |
                                 |                              |
                                 +------------------------------+
                                       Repeat until converged
```

### The Elbow Method
Because K-Means requires $K$ to be specified a priori, we must heuristically determine the optimal $K$. The Elbow Method plots WCSS against various values of $K$. As $K$ increases, WCSS inherently decreases. The optimal $K$ is typically at the "elbow" point—the inflection point where the rate of WCSS reduction diminishes significantly, indicating diminishing returns for adding more clusters.

## Implementation

Below is a robust implementation of K-Means showcasing the E-step and M-step logic using vectorized NumPy operations for efficiency.

```python
import numpy as np

class KMeansClustering:
    def __init__(self, k: int, max_iters: int = 300, tol: float = 1e-4):
        self.k = k
        self.max_iters = max_iters
        self.tol = tol
        self.centroids = None
        self.wcss = 0.0

    def fit(self, X: np.ndarray) -> None:
        m, n = X.shape
        
        # 1. Initialization (Randomly pick K points from X)
        random_idx = np.random.permutation(m)[:self.k]
        self.centroids = X[random_idx]

        for _ in range(self.max_iters):
            # 2. Assignment Step: Compute distances and assign clusters
            # Using broadcasting to compute distance from all points to all centroids
            # X shape: (m, 1, n) - centroids shape: (1, k, n) -> distances shape: (m, k)
            distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
            cluster_assignments = np.argmin(distances, axis=1)

            # 3. Update Step: Calculate new centroids
            new_centroids = np.zeros((self.k, n))
            for k_idx in range(self.k):
                points_in_cluster = X[cluster_assignments == k_idx]
                if len(points_in_cluster) > 0:
                    new_centroids[k_idx] = np.mean(points_in_cluster, axis=0)
                else:
                    # Handle empty clusters by keeping previous centroid
                    new_centroids[k_idx] = self.centroids[k_idx]

            # 4. Convergence check
            shift = np.linalg.norm(new_centroids - self.centroids)
            self.centroids = new_centroids
            
            if shift < self.tol:
                break
                
        # Calculate final WCSS
        final_distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
        min_distances = np.min(final_distances, axis=1)
        self.wcss = np.sum(min_distances ** 2)

    def predict(self, X: np.ndarray) -> np.ndarray:
        distances = np.linalg.norm(X[:, np.newaxis] - self.centroids, axis=2)
        return np.argmin(distances, axis=1)

# Example Usage
if __name__ == "__main__":
    from sklearn.datasets import make_blobs
    
    # Generate synthetic clustered data
    X, _ = make_blobs(n_samples=500, centers=4, cluster_std=0.60, random_state=0)
    
    # Elbow method simulation
    wcss_values = []
    for k_test in range(1, 8):
        kmeans = KMeansClustering(k=k_test)
        kmeans.fit(X)
        wcss_values.append(kmeans.wcss)
        print(f"K={k_test}, WCSS={kmeans.wcss:.2f}")
    
    # In a real scenario, you'd plot k_test vs wcss_values and look for the 'elbow' (K=4)
```

## System Constraints and Optimizations
K-Means assumes spherical clusters of similar density, as it relies on Euclidean distance. It performs poorly on elongated or intertwined structures (where DBSCAN or Gaussian Mixture Models are preferred). Furthermore, standard K-Means is extremely sensitive to initialization. In production, use **K-Means++** initialization, which selects initial centroids with probabilities proportional to their squared distance from already chosen centroids, practically guaranteeing $O(\log K)$ competitiveness with the optimal clustering and avoiding convergence to poor local minima. Scale feature values (e.g., Standard scaling) before applying K-Means, or features with larger absolute magnitudes will disproportionately dominate the distance metric.
