# Principal Component Analysis (PCA): Covariance Matrix and Eigenvectors

## The Problem
When deploying machine learning systems on tabular or image datasets, developers frequently encounter the **curse of dimensionality**. As the number of features ($n$) scales into hundreds or thousands, several critical issues emerge:
1. **Sparsity**: The volume of the feature space increases exponentially, making data points extremely sparse and causing distance metrics (like Euclidean distance) to converge to a uniform value.
2. **Multicollinearity**: Many features are highly correlated, introducing statistical redundancy and inflating parameter variance in linear models.
3. **Computational Inefficiency**: Downstream models require significantly more memory, storage, and processing power, creating latency bottlenecks at inference time.

The foundational challenge is to compress a high-dimensional feature matrix $X \in \mathbb{R}^{m \times n}$ into a lower-dimensional representation $Z \in \mathbb{R}^{m \times k}$ ($k \ll n$) while preserving the maximum possible variance (information) of the original dataset.

## Technical Architecture

Principal Component Analysis (PCA) is an unsupervised linear transformation technique that accomplishes dimensionality reduction by identifying orthogonal axes—called **Principal Components**—along which the variance of the data is maximized.

### The Mathematical Pipeline
To perform PCA, we proceed through five exact mathematical steps:

1. **Standardization**:
   We must scale the feature matrix $X$ to have zero mean ($\mu = 0$) and unit variance ($\sigma = 1$). Without standardization, features with larger scales will artificially dominate the principal components.
   $$ X_{scaled} = \frac{X - \mu}{\sigma} $$

2. **Covariance Matrix Construction**:
   We compute the $n \times n$ symmetric Covariance Matrix $\Sigma$ to capture the linear relationships between all pairs of scaled features:
   $$ \Sigma = \frac{1}{m} X_{scaled}^T X_{scaled} $$

3. **Eigendecomposition**:
   We solve for the eigenvectors $v$ and eigenvalues $\lambda$ of the covariance matrix $\Sigma$. Mathematically:
   $$ \Sigma v = \lambda v $$
   - **Eigenvectors** ($v$) represent the directions of the new orthogonal feature space.
   - **Eigenvalues** ($\lambda$) represent the magnitude of variance carried along each eigenvector.

4. **Constructing the Projection Matrix**:
   Sort the eigenvalues in descending order. Select the top $k$ eigenvectors corresponding to the $k$ largest eigenvalues to form the projection matrix $W \in \mathbb{R}^{n \times k}$.

5. **Transforming to Lower-Dimensional Space**:
   Project the original standardized features onto the new subspace:
   $$ Z = X_{scaled} W $$

```text
       Dimensionality Reduction Pipeline via Eigendecomposition
+-----------------+      +-----------------+      +-----------------------+
| Input Matrix X  | ---> | Standardize X   | ---> | Covariance Matrix     |
|   (m x n)       |      | (Mean=0, Std=1) |      | Sigma = (1/m)*X^T*X   |
+-----------------+      +-----------------+      +-----------------------+
                                                              |
                                                              v
+-----------------+      +-----------------+      +-----------------------+
| Projected Data  | <--- | Project Matrix  | <--- | Eigendecomposition    |
| Z = X_scaled * W|      | W (top k e-vecs)|      | Sigma * v = lambda * v|
|   (m x k)       |      |   (n x k)       |      | Get e-vecs & e-vals   |
+-----------------+      +-----------------+      +-----------------------+
```

## Implementation

The following pure NumPy implementation of PCA demonstrates data standardization, covariance calculation, eigendecomposition, sorting, and transformation.

```python
import numpy as np
from typing import Tuple

class CustomPCA:
    def __init__(self, n_components: int) -> None:
        self.n_components: int = n_components
        self.mean: np.ndarray = None
        self.std: np.ndarray = None
        self.components: np.ndarray = None  # Projection Matrix W
        self.explained_variance_ratio: np.ndarray = None

    def fit(self, X: np.ndarray) -> 'CustomPCA':
        """
        Fits PCA on feature matrix X.
        """
        m = X.shape[0]
        # Step 1: Standardize the features
        self.mean = np.mean(X, axis=0)
        self.std = np.std(X, axis=0)
        # Avoid division by zero for invariant columns
        self.std[self.std == 0.0] = 1.0
        X_scaled = (X - self.mean) / self.std

        # Step 2: Compute Covariance Matrix: (1/m) * X^T * X
        covariance_matrix = np.cov(X_scaled, rowvar=False)

        # Step 3: Compute Eigenvalues and Eigenvectors
        # eigh is optimized and highly stable for symmetric matrices (like covariance)
        eigenvalues, eigenvectors = np.linalg.eigh(covariance_matrix)

        # Step 4: Sort eigenvalues and eigenvectors in descending order
        sorted_indices = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[sorted_indices]
        eigenvectors = eigenvectors[:, sorted_indices]

        # Calculate Explained Variance Ratios
        total_variance = np.sum(eigenvalues)
        self.explained_variance_ratio = eigenvalues / total_variance

        # Select top k components
        self.components = eigenvectors[:, :self.n_components]
        return self

    def transform(self, X: np.ndarray) -> np.ndarray:
        """
        Projects X onto the principal components.
        """
        X_scaled = (X - self.mean) / self.std
        return X_scaled.dot(self.components)

if __name__ == "__main__":
    from sklearn.datasets import load_iris

    # Load high-dimensional data (4 dimensions for Iris)
    iris = load_iris()
    X = iris.data

    # Instantiate custom PCA to reduce from 4D to 2D
    pca = CustomPCA(n_components=2)
    pca.fit(X)
    X_reduced = pca.transform(X)

    print("--- Custom PCA Dimensionality Reduction ---")
    print(f"Original Feature Shape: {X.shape}")
    print(f"Reduced Subspace Shape: {X_reduced.shape}")
    print(f"Explained Variance of components: {pca.explained_variance_ratio[:2]}")
    print(f"Total Preserved Variance: {np.sum(pca.explained_variance_ratio[:2]) * 100:.2f}%")
```

## System Constraints and Optimizations
While PCA is highly powerful, system architects must recognize several limitations:

1. **Linear Limit**: PCA assumes variables have linear relationships. If the dataset forms a complex non-linear manifold (such as a 3D swiss roll), PCA fails to capture the true topological structure. In such cases, developers must utilize non-linear alternatives like **Kernel PCA**, **t-SNE**, or **UMAP**.
2. **Computational Complexity**: Computing the exact covariance matrix and performing full eigendecomposition has a time complexity of $O(n^3)$. If the feature count $n$ is very large (e.g., $n > 50,000$), calculating the exact eigenvectors becomes prohibitive.
3. **Out-of-Core Processing**: Standard PCA requires the entire dataset to reside in RAM. For extremely large-scale analytics, deploy **Incremental PCA (IPCA)**, which performs Singular Value Decomposition (SVD) on mini-batches of data, allowing out-of-core compression.
