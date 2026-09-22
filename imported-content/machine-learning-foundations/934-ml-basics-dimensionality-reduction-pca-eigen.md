# Principal Component Analysis (PCA): Covariance Matrix and Eigenvectors

## The Problem
High-dimensional datasets introduce severe engineering obstacles, a phenomenon known as the **curse of dimensionality**. As the feature space $n$ expands, the volume of the space increases exponentially, making the available data points sparse. This sparsity degrades distance-based algorithms (such as K-Means or KNN) because Euclidean distances between points converge to a uniform value, rendering similarity metrics useless. 

Furthermore, training classifiers on hundreds of raw features causes severe overfitting and wastes massive RAM and CPU cycles. To address this, we need an unsupervised, linear projection technique that compresses a high-dimensional feature matrix $X \in \mathbb{R}^{m \times n}$ into a lower-dimensional representation $Z \in \mathbb{R}^{m \times k}$ ($k \ll n$) while systematically preserving the maximum possible variance of the original data.

## Technical Architecture

Principal Component Analysis (PCA) achieves dimensionality reduction by projecting the data onto orthogonal directions of maximum variance.

```text
High-Dimensional Space X          Mean Centering                   Compute Covariance Matrix
 +-----------------------+        +-------------------+            +------------------------+
 | Raw Features (m, n)   | ---->  | Centered X_mean   | ---------> |  Sigma = (1/m) X^T * X |
 +-----------------------+        +-------------------+            +------------------------+
                                                                               |
                                                                               | Eigen-decomposition
                                                                               v
 +-----------------------+        +-------------------+            +------------------------+
 | Projection Z = X * Vk | <----- | Sort Eigenvectors | <--------- | Eigenvectors & Values  |
 | Compressed (m, k)     |        | Select Top k (Vk) |            |   Sigma * v = lmbda * v|
 +-----------------------+        +-------------------+            +------------------------+
```

### 1. Data Centering
PCA is highly sensitive to the scale and mean of the features. Before calculating projections, we must center the data by subtracting the mean of each feature:

$$ X_{\text{centered}} = X - \mu_X $$

Standardizing features to unit variance (z-score normalization) is also mandatory if features have different measurement scales.

### 2. The Covariance Matrix
To identify the directions of maximum variance, we compute the symmetric **Covariance Matrix** $\Sigma \in \mathbb{R}^{n \times n}$ of the centered data:

$$ \Sigma = \frac{1}{m} X_{\text{centered}}^T X_{\text{centered}} $$

The diagonal entries represent the variance of individual features, and off-diagonal entries represent covariances between feature pairs.

### 3. Eigenvalue Decomposition
We solve for the **eigenvalues** $\lambda$ and **eigenvectors** $v$ of the covariance matrix:

$$ \Sigma v = \lambda v \implies (\Sigma - \lambda I) v = 0 $$

* **Eigenvectors** ($v$) represent the principal components (orthogonal directions of projection).
* **Eigenvalues** ($\lambda$) quantify the variance captured along each corresponding eigenvector.

To reduce dimensionality to $k$ dimensions, we sort the eigenvectors by their eigenvalues in descending order and construct a projection matrix $W \in \mathbb{R}^{n \times k}$ containing the top $k$ eigenvectors.

### 4. Vectorized Projection
The projected, low-dimensional data $Z \in \mathbb{R}^{m \times k}$ is obtained via matrix multiplication:

$$ Z = X_{\text{centered}} W $$

### 5. Explained Variance Ratio
The proportion of information retained by selecting $k$ principal components is quantified by the Explained Variance Ratio:

$$ \text{Explained Variance Ratio}_j = \frac{\lambda_j}{\sum_{i=1}^{n} \lambda_i} $$

## Implementation

The following Python class implements PCA from scratch using pure NumPy. It leverages `np.linalg.eigh`, which is numerically optimized and highly stable for symmetric matrices like the covariance matrix.

```python
import numpy as np
from typing import Tuple

class PrincipalComponentAnalysisScratch:
    def __init__(self, n_components: int = 2) -> None:
        self.n_components: int = n_components
        self.components: np.ndarray = None  # Projection matrix (eigenvectors)
        self.mean: np.ndarray = None
        self.eigenvalues: np.ndarray = None
        self.explained_variance_ratio: np.ndarray = None

    def fit(self, X: np.ndarray) -> 'PrincipalComponentAnalysisScratch':
        m, n = X.shape
        if self.n_components > n:
            raise ValueError(f"n_components ({self.n_components}) cannot exceed feature dimension ({n}).")

        # 1. Compute Mean and Center the data
        self.mean = np.mean(X, axis=0)
        X_centered = X - self.mean

        # 2. Compute Covariance Matrix: (n, n)
        covariance_matrix = (1.0 / m) * X_centered.T.dot(X_centered)

        # 3. Compute Eigenvalues and Eigenvectors
        # eigh is optimized and highly stable for symmetric real matrices
        eigenvalues, eigenvectors = np.linalg.eigh(covariance_matrix)

        # np.linalg.eigh returns eigenvalues in ascending order, so we reverse them
        sorted_indices = np.argsort(eigenvalues)[::-1]
        self.eigenvalues = eigenvalues[sorted_indices]
        sorted_eigenvectors = eigenvectors[:, sorted_indices]

        # 4. Calculate Explained Variance Ratio
        total_variance = np.sum(self.eigenvalues)
        self.explained_variance_ratio = self.eigenvalues / total_variance

        # 5. Store the top K eigenvectors (projection matrix of shape (n, k))
        self.components = sorted_eigenvectors[:, :self.n_components]
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        if self.components is None:
            raise ValueError("PCA model has not been fitted yet.")
        # Center the data using fitted mean
        X_centered = X - self.mean
        # Project centered data onto selected principal components
        return X_centered.dot(self.components)

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        return self.fit(X).transform(X)

if __name__ == "__main__":
    # Generate 3D synthetic dataset where variance is dominated by 2 main directions
    np.random.seed(42)
    # Generate random 2D plane data
    x1 = np.random.normal(0, 5, 100)
    x2 = np.random.normal(0, 2, 100)
    # x3 is highly dependent on x1 and x2 with a tiny bit of noise
    x3 = 0.8 * x1 + 0.5 * x2 + np.random.normal(0, 0.1, 100)
    X_train = np.column_stack((x1, x2, x3))

    # Fit and transform using our PCA implementation
    pca = PrincipalComponentAnalysisScratch(n_components=2)
    X_reduced = pca.fit_transform(X_train)

    print("--- Principal Component Analysis (PCA) Results ---")
    print(f"Retained Principal Components shape: {pca.components.shape}")
    print(f"First 2 Principal Component Eigenvectors:\n{pca.components.T}")
    print(f"Top 3 Eigenvalues of Covariance Matrix: {pca.eigenvalues[:3]}")
    print(f"Explained Variance Ratio per Component: {pca.explained_variance_ratio[:2]}")
    print(f"Total Explained Variance: {np.sum(pca.explained_variance_ratio[:2]) * 100:.2f}%")
```

## System Constraints and Optimizations
Implementing dimensionality reduction pipelines requires analyzing mathematical and computational boundaries:

1. **Scale Dependency**: PCA is variance-maximization. If a feature (e.g., house price) is measured in millions and another (e.g., bedrooms) is in single digits, house price variance will completely dominate the covariance matrix, producing eigenvectors aligned almost entirely with house price. Standardizing data is crucial.
2. **Computational Complexity**: Computing the covariance matrix scales as $O(m \cdot n^2)$ and calculating full eigenvectors/values is $O(n^3)$. If the feature count $n$ exceeds 10,000, computing full eigen-decomposition is prohibitively expensive. In such scenarios, randomized or incremental Singular Value Decomposition (SVD) should be utilized.
3. **Linear Subspace Constraint**: PCA projects data onto linear combinations of features. It cannot capture non-linear geometric structures (such as a 3D spiral or "Swiss roll"). 

**Production Recommendation**: For high-dimensional datasets where $n > 10,000$, avoid constructing the full covariance matrix; instead, use SVD-based algorithms (like truncated randomized SVD) to find principal components directly. If non-linear mappings are present, utilize Kernel PCA or manifold-learning algorithms like t-SNE or UMAP.
