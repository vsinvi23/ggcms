# Principal Component Analysis (PCA): Covariance Matrix and Eigenvectors

## The Problem
High-dimensional datasets (e.g., genomics, high-res images) suffer from the "Curse of Dimensionality." As the number of features $n$ grows, data becomes sparse, distance metrics degrade, and computational complexity explodes. Many features are highly correlated, introducing multicollinearity and redundant information. The engineering challenge is mapping a high-dimensional feature space to a lower-dimensional latent space while strictly preserving the maximum amount of variance (information) present in the original dataset.

## Technical Architecture

Principal Component Analysis (PCA) achieves this via an orthogonal linear transformation. It projects data onto a new coordinate system where the axes (Principal Components) represent the directions of maximum variance and are mutually uncorrelated.

### Mathematical Formulation
1. **Centering:** Mean-center the data matrix $X$ ($m \times n$).
2. **Covariance Matrix:** Compute the $n \times n$ covariance matrix $\Sigma$, capturing the pairwise correlation between all features.
   $$ \Sigma = \frac{1}{m-1} X^T X $$
3. **Eigendecomposition:** Compute the eigenvectors ($v$) and eigenvalues ($\lambda$) of $\Sigma$.
   $$ \Sigma v = \lambda v $$
   - **Eigenvectors** denote the *directions* of the new axes (Principal Components).
   - **Eigenvalues** denote the *magnitude* of variance captured along those axes.
4. **Projection:** Sort eigenvectors by descending eigenvalues. Select the top $k$ eigenvectors to form a projection matrix $W$ ($n \times k$). Project the original data into the new subspace:
   $$ X_{reduced} = X W $$

```text
+----------+      +-------------------+      +------------------+      +----------------+
|          |      |                   |      |                  |      |                |
| Centered | ---> | Covariance Matrix | ---> | Eigendecomposition| ---> | Top K Eigenvec |
| Matrix X |      | Sigma = X^T * X   |      | (Eigenvalues, V) |      | Matrix W       |
|          |      |                   |      |                  |      |                |
+----------+      +-------------------+      +------------------+      +----------------+
                                                                               |
                                                                               v
                                                                       +----------------+
                                                                       | Reduced Data   |
                                                                       | Z = X * W      |
                                                                       +----------------+
```

## Implementation

PCA is highly determinisic and strictly analytical. The following implementation demonstrates the exact mathematical steps using standard NumPy linear algebra routines.

```python
import numpy as np

class PrincipalComponentAnalysis:
    def __init__(self, n_components: int):
        self.n_components = n_components
        self.components = None
        self.mean = None
        self.explained_variance_ratio_ = None

    def fit(self, X: np.ndarray) -> None:
        """
        Fits PCA on data X.
        X: shape (m, n)
        """
        # 1. Mean centering
        self.mean = np.mean(X, axis=0)
        X_centered = X - self.mean

        # 2. Covariance matrix (numpy cov expects variables as rows, so we transpose)
        # Alternatively, manually compute: (X_centered.T @ X_centered) / (m - 1)
        cov_matrix = np.cov(X_centered, rowvar=False)

        # 3. Eigendecomposition
        eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)

        # 4. Sort eigenvectors by eigenvalues in descending order
        # eigh doesn't guarantee sorting order
        sorted_indices = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[sorted_indices]
        eigenvectors = eigenvectors[:, sorted_indices]

        # Store top n_components
        self.components = eigenvectors[:, :self.n_components]
        
        # Calculate explained variance
        total_variance = np.sum(eigenvalues)
        self.explained_variance_ratio_ = eigenvalues[:self.n_components] / total_variance

    def transform(self, X: np.ndarray) -> np.ndarray:
        """
        Projects X onto the principal components.
        """
        # Center data
        X_centered = X - self.mean
        # Project onto components
        return np.dot(X_centered, self.components)

# Example Usage
if __name__ == "__main__":
    from sklearn.datasets import load_iris
    
    # Load 4-dimensional dataset
    X, y = load_iris(return_X_y=True)
    
    # It is CRITICAL to scale features before PCA if they have different units,
    # though standard iris data is relatively uniform.
    X_std = (X - np.mean(X, axis=0)) / np.std(X, axis=0)

    # Reduce to 2 dimensions
    pca = PrincipalComponentAnalysis(n_components=2)
    pca.fit(X_std)
    X_reduced = pca.transform(X_std)
    
    print(f"Original shape: {X.shape}")
    print(f"Reduced shape: {X_reduced.shape}")
    print(f"Variance explained by PC1: {pca.explained_variance_ratio_[0]*100:.2f}%")
    print(f"Variance explained by PC2: {pca.explained_variance_ratio_[1]*100:.2f}%")
```

## System Constraints and Optimizations
PCA is restricted to linear transformations. If the data lies on a non-linear manifold (e.g., a "Swiss Roll"), PCA will collapse the topology destructively; use t-SNE, UMAP, or Autoencoders instead. 

Computationally, computing the $n \times n$ covariance matrix and its eigendecomposition becomes a severe bottleneck when $n$ is very large (e.g., high-res images where $n > 1,000,000$). In such sparse/high-dimensional paradigms, engineering systems swap standard Eigendecomposition for Truncated Singular Value Decomposition (SVD). SVD computes the top $k$ principal components directly on the centered data matrix $X$ without explicitly manifesting the dense $n \times n$ covariance matrix, saving immense memory overhead. Furthermore, feature scaling (Standardization) is an absolute prerequisite; PCA maximizes variance, meaning features with larger scalar magnitudes will arbitrarily dominate the first principal component if not normalized.
