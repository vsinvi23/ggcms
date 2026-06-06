/**
 * Re-export useAuth from AuthContext so that imports from either location
 * (@/api/hooks/useAuth or @/contexts/AuthContext) refer to the same hook
 * and therefore the same auth state.
 *
 * The previous duplicate `useAuthApi` hook called authService directly and
 * bypassed AuthContext, causing split-brain: a component using useAuthApi.login()
 * would not update the global auth state seen by ProtectedRoute or the header.
 */
export { useAuth as default, useAuth } from '@/contexts/AuthContext';
