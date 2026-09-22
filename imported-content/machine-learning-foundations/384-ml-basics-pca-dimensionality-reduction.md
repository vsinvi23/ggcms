# Principal Component Analysis (PCA): The Math of Dimensionality Reduction

High-dimensional data presents a major challenge in machine learning, a phenomenon known as the **curse of dimensionality**. As the number of features increases, the volume of space grows exponentially, making the data sparse. This sparsity causes models to overfit, drastically inflates memory footprint, and increases inference latency. Principal Component Analysis (PCA) is an unsupervised linear dimensionality reduction technique that addresses this problem. It compresses high-dimensional datasets by projecting them onto a lower-dimensional coordinate system of orthogonal axes that capture the maximum variance.

---

## The Problem: Redundant Information and Latency in Large Datasets

Consider a dataset tracking system performance containing dozens of highly correlated features—such as disk read rate, disk write rate, network packets, throughput, and CPU utilization. Storing and analyzing all these columns is highly redundant. 

Furthermore, feeding highly correlated features into models like Linear or Logistic Regression creates instability in parameter estimation (multi-collinearity). We want to compress these features into a small set of uncorrelated variables (Principal Components) while retaining as much of the original information (variance) as possible.

---

## Technical Architecture of PCA

PCA transforms the coordinates of our dataset to align with the directions of greatest variance.

```
          [ High-Dimensional Input X ] (N x D)
                      |
              [ Zero-Center Data ]  (Subtract Mean)
                      |
           [ Covariance Matrix Σ ]  (D x D)
                      |
         [ Eigendecomposition of Σ ] ---> Eigenvalues (λ_1, λ_2...) & Eigenvectors (v_1, v_2...)
                      |
        [ Select Top K Eigenvectors ] ---> Projection Matrix W (D x K)
                      |
        [ Project Original Data: Z = XW ] ---> [ Low-Dimensional Output Z ] (N x K)
```

### 1. Zero-Centering
Before calculating the principal components, the data must be centered around the origin. For each feature column, we subtract its mean:

$$X_{\text{centered}} = X - \mu_X$$

### 2. Computing the Covariance Matrix
The covariance matrix $\Sigma$ of size $D \times D$ represents the pairwise linear relationships between features:

$$\Sigma = \frac{1}{n-1} X_{\text{centered}}^T X_{\text{centered}}$$

### 3. Eigendecomposition
We find the principal directions by computing the eigenvalues ($\lambda$) and eigenvectors ($v$) of the covariance matrix:

$$\Sigma v = \lambda v$$

* **Eigenvectors ($v$):** Represent the directions of the new coordinate axes (principal components). These axes are mathematically guaranteed to be orthogonal (uncorrelated).
* **Eigenvalues ($\lambda$):** Represent the amount of variance captured by each principal component.

### 4. Projection
To project the $N \times D$ data down to a smaller size of $N \times K$, we sort the eigenvectors by their corresponding eigenvalues in descending order, select the top $K$ vectors, and assemble them into a projection matrix $W$ of size $D \times K$. The reduced representation $Z$ is:

$$Z = X_{\text{centered}} W$$

---

## Robust Implementation in Python

Below is a complete implementation of PCA using NumPy. It handles zero-centering, computes the covariance matrix, performs eigendecomposition, and returns the projected data along with the explained variance ratios.

```python
import numpy as np

class PCAScratch:
    def __init__(self, n_components: int):
        self.n_components = n_components
        self.mean = None
        self.components = None  # Projection matrix (eigenvectors)
        self.explained_variance_ratio = None

    def fit(self, X: np.ndarray):
        # 1. Zero-Center the Data
        self.mean = np.mean(X, axis=0)
        X_centered = X - self.mean

        # 2. Compute the Covariance Matrix (D x D)
        # Note: rowvar=False because columns represent features
        cov_matrix = np.cov(X_centered, rowvar=False)

        # 3. Eigendecomposition
        # Use eigh because the covariance matrix is symmetric
        eigenvalues, eigenvectors = np.linalg.eigh(cov_matrix)

        # 4. Sort in descending order of eigenvalues
        sorted_indices = np.argsort(eigenvalues)[::-1]
        eigenvalues = eigenvalues[sorted_indices]
        eigenvectors = eigenvectors[:, sorted_indices]

        # 5. Store components and compute explained variance ratios
        total_variance = np.sum(eigenvalues)
        self.components = eigenvectors[:, :self.n_components]
        self.explained_variance_ratio = (eigenvalues[:self.n_components] / total_variance)

    def transform(self, X: np.ndarray) -> np.ndarray:
        # Zero-center using the stored mean from the training split
        X_centered = X - self.mean
        # Project data into lower-dimensional space
        return np.dot(X_centered, self.components)

    def fit_transform(self, X: np.ndarray) -> np.ndarray:
        self.fit(X)
        return self.transform(X)
```

---

## Developer Takeaways

* **Standard Scaling is Essential:** PCA is highly sensitive to the scale of the features. Features with the largest scale will dominate the covariance calculations, and PCA will align eigenvectors with them, ignoring smaller features. Always standardize features ($z$-score scale) before executing PCA.
* **Select $K$ Based on Variance:** Instead of picking a random value for $K$, compute the cumulative sum of the explained variance ratio. Choose a $K$ that retains a target threshold of total information—typically $95\%$ of the original variance.
* **PCA is Linear:** PCA only captures linear correlations. For complex, non-linear distributions (e.g., Swiss roll manifolds), you must use non-linear dimensionality reduction techniques like Kernel PCA, t-SNE, or UMAP.
