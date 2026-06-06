import { Navigate } from 'react-router-dom';

// Consolidated into /configuration — this page now redirects there
export default function CategoriesPage() {
  return <Navigate to="/configuration" replace />;
}
