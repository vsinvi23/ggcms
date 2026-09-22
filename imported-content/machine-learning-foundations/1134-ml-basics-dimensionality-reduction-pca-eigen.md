# Principal Component Analysis (PCA): Covariance Matrix and Eigenvectors

## The Problem
High-dimensional data suffers from the "Curse of Dimensionality." As the number of features grows, distance metrics lose meaning, visualization becomes impossible, and models severely overfit. The challenge is reducing the feature space ($d$-dimensions) into a smaller subspace ($k$-dimensions) while preserving the maximum amount of structural variance (information) from the original dataset.

## Architectural Approach
**Principal Component Analysis (PCA)** is a linear dimensionality reduction technique. It orthogonalizes the axes of the dataset by projecting it onto a new coordinate system where the axes represent the directions of maximum variance (Principal Components).

**Mathematical Pipeline**:
1. **Standardization**: Center the data to mean zero.
2. **Covariance Matrix**: Calculate $\Sigma = \frac{1}{n-1} X^T X$, which captures how features vary together.
3. **Eigendecomposition**: Solve $\Sigma v = \lambda v$ to find eigenvectors ($v$) and eigenvalues ($\lambda$).
4. **Projection**: Sort eigenvectors by descending eigenvalues. The top $k$ eigenvectors form the projection matrix $W$. Project data: $X_{pca} = XW$.

```text
    +-----------+      +----------------+      +----------------+
    | Raw Data  | ---> | Covariance (Σ) | ---> | Eigenvectors & | 
    | X (n x d) |      | Matrix (d x d) |      | Eigenvalues    |
    +-----------+      +----------------+      +----------------+
                                                       |
                                                       v
    +-----------+      +----------------+      +----------------+
    | Projected | <--- | Matrix Multiply| <--- | Top K Vectors  |
    | X (n x k) |      | X_pca = X * W  |      | Matrix W (d x k|
    +-----------+      +----------------+      +----------------+
```

## Implementation

The following Python code implements PCA from scratch using NumPy to expose the underlying linear algebra, then compares the output variance retention.

```python
import numpy as np
from sklearn.datasets import load_iris
from sklearn.preprocessing import StandardScaler

class CustomPCA:
    def __init__(self, n_components):
        self.n_components = n_components
        self.components = None
        self.mean = None
        self.explained_variance_ratio_ = None

    def fit_transform(self, X):
        # 1. Center the data
        self.mean = np.mean(X, axis=0)
        X_centered = X - self.mean

        # 2. Covariance Matrix
        # rowvar=False expects variables in columns
        cov_matrix = np.cov(X_centered, rowvar=False)

        # 3. Eigendecomposition
        eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)

        # 4. Sort eigenvectors by descending eigenvalues
        sorted_indices = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[sorted_indices]
        eigenvectors = eigenvectors[:, sorted_indices]

        # 5. Store top K components
        self.components = eigenvectors[:, :self.n_components]
        
        # Calculate explained variance
        total_variance = np.sum(eigenvalues)
        self.explained_variance_ratio_ = eigenvalues[:self.n_components] / total_variance

        # 6. Project data
        return np.dot(X_centered, self.components)

# -------------------------
# Usage Example
# -------------------------
if __name__ == "__main__":
    # Load Iris dataset (4 dimensions)
    data = load_iris()
    X = data.data
    
    # PCA requires standardized features
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    # Reduce from 4D to 2D
    pca = CustomPCA(n_components=2)
    X_reduced = pca.fit_transform(X_scaled)

    print(f"Original Shape: {X_scaled.shape}")
    print(f"Reduced Shape : {X_reduced.shape}")
    print(f"Variance Retained: {np.sum(pca.explained_variance_ratio_) * 100:.2f}%")
```

## Trade-offs and Considerations
1. **Linearity**: PCA can only capture linear correlations. If the data lies on a non-linear manifold (e.g., a "Swiss Roll"), PCA will fail to unfold it properly. Non-linear alternatives like t-SNE or UMAP are required.
2. **Interpretability**: The resulting Principal Components are linear combinations of *all* original features. They lose their physical meaning (e.g., PC1 is no longer "Age" or "Income", but a math vector).
3. **Scaling Required**: Because PCA seeks to maximize variance, features with inherently larger scales (e.g., Salary in millions vs. Age in decades) will dominate the eigenvectors. Standardization (Z-score scaling) is absolutely mandatory before running PCA.
