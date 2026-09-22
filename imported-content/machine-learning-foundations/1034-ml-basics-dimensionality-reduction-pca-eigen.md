# Principal Component Analysis (PCA): Covariance Matrix and Eigenvectors

## The Problem
Enterprise machine learning environments are flooded with high-dimensional datasets, including broad genomic profiles, visual pixel features, or detailed user behavioral logs. This high dimensionality introduces the "curse of dimensionality": feature spaces grow exponentially, sparsity increases, and the parameter space of predictive models balloons. This leads directly to model overfitting, high memory footprints, and prolonged training cycles.

Furthermore, multi-dimensional structures are impossible for human engineers to visualize or interpret directly. To resolve this, we need a method to project a high-dimensional feature space $X \in \mathbb{R}^{m \times n}$ onto a compressed, lower-dimensional representation $Z \in \mathbb{R}^{m \times k}$ (where $k \ll n$) without losing key signal. The core objective of Principal Component Analysis (PCA) is to perform this linear compression while maximizing the retained variance of the original dataset.

## Technical Architecture

PCA works by identifying a new set of orthogonal axes—called **Principal Components**—along which the variance of the data is maximized.

```text
High-Dimensional Feature Space (m, n)
             |
             | Step 1: Mean Centering (X - mu)
             v
+-----------------------------+
| Centered Data X_centered    |
+-----------------------------+
             |
             | Step 2: Compute Covariance Matrix: Sigma = (X^T * X) / (m-1)
             v
+-----------------------------+
| Covariance Matrix (n, n)    |
+-----------------------------+
             |
             | Step 3: Spectral Decomposition (np.linalg.eigh)
             v
+--------------------------------------------------------+
| Eigenvalues (Lambda)   | Orthogonal Eigenvectors (V)   |
| (Variance Captured)     | (Principal Component Axes)     |
+--------------------------------------------------------+
             |
             | Step 4: Sort Descending & Select Top k Vectors (W)
             v
+-----------------------------+
| Projection Matrix W (n, k)  |
+-----------------------------+
             |
             | Step 5: Linear Projection: Z = X_centered * W
             v
Lower-Dimensional Compressed Space Z (m, k)
```

### 1. Step-by-Step Mathematical Formulation

* **Mean Centering**: Centering guarantees that the first principal component aligns with the direction of maximum variance.
  $$ X_{\text{centered}} = X - \mu_x $$
  Where $\mu_x$ is the column-wise mean vector.

* **The Covariance Matrix**: We measure how features vary together by calculating the symmetric Covariance Matrix $\Sigma \in \mathbb{R}^{n \times n}$:
  $$ \Sigma = \frac{1}{m - 1} X_{\text{centered}}^T X_{\text{centered}} $$

* **Eigenvalue Decomposition**: We decompose $\Sigma$ to find its eigenvalues $\lambda$ and eigenvectors $v$:
  $$ \Sigma v = \lambda v $$
  The eigenvector $v$ represents the direction of the principal component. The corresponding eigenvalue $\lambda$ quantifies the variance captured along that direction.

* **Sorting and Projecting**: Sorting eigenvectors by their eigenvalues in descending order gives us the ranking of the components. Selecting the top $k$ eigenvectors forms our projection matrix $W \in \mathbb{R}^{n \times k}$. We then project the centered data into the lower-dimensional space:
  $$ Z = X_{\text{centered}} W $$

### 2. Explained Variance Ratio
The percentage of the total dataset variance captured by the $j$-th principal component is:

$$ \text{Explained Variance Ratio}_j = \frac{\lambda_j}{\sum_{i=1}^{n} \lambda_i} $$

## Implementation

The following Python class implements PCA from scratch using NumPy, emphasizing covariance estimation, spectral decomposition via `np.linalg.eigh`, and explained variance calculations.

```python
import numpy as np
from typing import Tuple

class PCAScratch:
    """
    Principal Component Analysis (PCA) for dimensionality reduction from scratch.
    """
    def __init__(self, n_components: int = 2) -> None:
        self.n_components: int = n_components
        self.components: np.ndarray = None # W matrix (eigenvectors)
        self.mean: np.ndarray = None
        self.eigenvalues: np.ndarray = None
        self.explained_variance_ratio_: np.ndarray = None

    def fit(self, X: np.ndarray) -> 'PCAScratch':
        """
        Calculates principal component axes (eigenvectors) from training data.
        """
        m = X.shape[0]
        # Step 1: Center the data
        self.mean = np.mean(X, axis=0)
        X_centered = X - self.mean
        
        # Step 2: Compute covariance matrix
        covariance_matrix = (1.0 / (m - 1)) * X_centered.T.dot(X_centered)
        
        # Step 3: Compute eigenvalues and eigenvectors
        # np.linalg.eigh is mathematically optimized for symmetric matrices like Covariance
        eigenvalues, eigenvectors = np.linalg.eigh(covariance_matrix)
        
        # np.linalg.eigh returns them in ascending order; reverse to get descending order
        sorted_indices = np.argsort(eigenvalues)[::-1]
        self.eigenvalues = eigenvalues[sorted_indices]
        sorted_eigenvectors = eigenvectors[:, sorted_indices]
        
        # Step 4: Calculate Explained Variance Ratio
        total_variance = np.sum(self.eigenvalues)
        self.explained_variance_ratio_ = self.eigenvalues / total_variance
        
        # Keep only the top k components
        self.components = sorted_eigenvectors[:, :self.n_components]
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        """
        Projects input data onto the lower-dimensional subspace.
        """
        if self.components is None or self.mean is None:
            raise ValueError("PCA model has not been fitted yet.")
        X_centered = X - self.mean
        return X_centered.dot(self.components)

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        """
        Fits PCA components and projects data in a single step.
        """
        return self.fit(X).transform(X)

if __name__ == "__main__":
    # Generate synthetic 3-dimensional data with high correlation
    np.random.seed(42)
    x1 = np.random.randn(150)
    x2 = x1 * 1.5 + np.random.randn(150) * 0.1 # strongly correlated with x1
    x3 = np.random.randn(150) * 0.2            # low variance noise
    X_data = np.vstack((x1, x2, x3)).T         # Shape (150, 3)

    # Initialize and execute PCA from scratch
    pca = PCAScratch(n_components=2)
    X_reduced = pca.fit_transform(X_data)
    
    print("--- PCA Execution Diagnostics ---")
    print("Original Feature Shape:", X_data.shape)
    print("Compressed Feature Shape:", X_reduced.shape)
    print("Principal Component Weights (W Matrix):\n", pca.components)
    print("Eigenvalues (Variance per Component):", pca.eigenvalues[:3])
    print(f"Explained Variance Ratio: {pca.explained_variance_ratio_[:2] * 100}%")
    print(f"Total Cumulative Variance Captured: {np.sum(pca.explained_variance_ratio_[:2]) * 100:.2f}%")
```

## System Constraints and Optimizations

Deploying PCA in large-scale data pipelines reveals important scalability constraints:

1. **Covariance Scale Bottleneck**: Computing the covariance matrix $\Sigma$ requires calculating $n \times n$ values, which scales as $O(n^2 \cdot m)$. If the dataset features $n = 50,000$ columns, the covariance matrix requires $2.5 \times 10^9$ elements (10 GB RAM) just for storage, leading to out-of-memory errors on typical workers.
2. **Standardization Sensitivity**: PCA is highly sensitive to the scale of input features. If one feature is measured in meters and another in kilometers, the feature with the larger variance will dominate the covariance calculation, distorting the direction of the first principal component. Features must always be standardized to unit variance before applying PCA.
3. **Alternative SVD Optimizations**: Production systems like scikit-learn bypass explicit covariance matrix calculation entirely. Instead, they apply Singular Value Decomposition (SVD) directly to the centered design matrix $X_{\text{centered}} = U S V^T$. This bypasses the $O(n^2)$ covariance storage footprint and is numerically more stable.

**Production Recommendation**: For high-dimensional datasets, use SVD-based PCA. When dataset dimensions exceed standard RAM capacities, deploy **Incremental PCA** which processes mini-batches of data, updating the components iteratively.
