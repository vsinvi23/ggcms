import { lazy, Suspense, Component, ReactNode } from 'react';
import { Provider } from 'react-redux';
import { store } from './store';
import { AuthProvider } from './contexts/AuthContext';
import { FeatureFlagProvider } from './contexts/FeatureFlagContext';
import { Toaster } from '@/components/ui/toaster';
import { Toaster as Sonner } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './components/layout/ProtectedRoute';

const UserManagementPage = lazy(() => import('./pages/UserManagement'));
const UserManagementDashboard = lazy(() => import('./pages/UserManagementDashboard'));
const GroupsPage = lazy(() => import('./pages/GroupsPage'));
const AdminContentOverview = lazy(() => import('./pages/AdminContentOverview'));
const ConfigurationPage = lazy(() => import('./pages/ConfigurationPage'));
const DashboardPage = lazy(() => import('./pages/Dashboard'));
const ContentManagement = lazy(() => import('./pages/ContentManagement'));
const CourseManagement = lazy(() => import('./pages/CourseManagement'));
const CourseCreator = lazy(() => import('./pages/CourseCreator'));
const ArticleManagement = lazy(() => import('./pages/ArticleManagement'));
const ArticleCreator = lazy(() => import('./pages/ArticleCreator'));
const MyTasks = lazy(() => import('./pages/MyTasks'));
const Analytics = lazy(() => import('./pages/Analytics'));
const Settings = lazy(() => import('./pages/Settings'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const UserSettings = lazy(() => import('./pages/UserSettings'));
const PublicHome = lazy(() => import('./pages/PublicHome'));
const Auth = lazy(() => import('./pages/Auth'));
const TechnologyPage = lazy(() => import('./pages/TechnologyPage'));
const CourseCategoryPage = lazy(() => import('./pages/CourseCategoryPage'));
const SearchResults = lazy(() => import('./pages/SearchResults'));
const LearningPathPage = lazy(() => import('./pages/LearningPathPage'));
const ArticleViewPage = lazy(() => import('./pages/ArticleViewPage'));
const CourseViewPage = lazy(() => import('./pages/CourseViewPage'));
const PublicArticleView = lazy(() => import('./pages/PublicArticleView'));
const PublicCourseView = lazy(() => import('./pages/PublicCourseView'));
const MyLearning = lazy(() => import('./pages/MyLearning'));
const NotesHighlightsPage = lazy(() => import('./pages/NotesHighlightsPage'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const NotFound = lazy(() => import('./pages/NotFound'));
const BulkImport = lazy(() => import('./pages/BulkImport'));

class AppErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-8 text-center">
          <div>
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <button className="text-sm text-primary underline" onClick={() => window.location.reload()}>
              Reload page
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, retry: 1 } },
});

const App = () => (
  <Provider store={store}>
    <QueryClientProvider client={queryClient}>
      <FeatureFlagProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AppErrorBoundary>
            <Suspense fallback={<div className="flex min-h-screen items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" /></div>}>
              <Routes>
                {/* Public Routes */}
                <Route path="/" element={<PublicHome />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<OAuthCallback />} />
                <Route path="/search" element={<SearchResults />} />
                <Route path="/technology/:slug" element={<TechnologyPage />} />
                <Route path="/explore/:category" element={<CourseCategoryPage />} />
                <Route path="/article/*" element={<PublicArticleView />} />
                <Route path="/course/*" element={<CourseViewPage />} />
                <Route path="/learn/:path" element={<LearningPathPage />} />

                {/* Protected Admin Routes */}
                <Route path="/admin" element={<ProtectedRoute><ContentManagement /></ProtectedRoute>} />
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/user-management" element={<ProtectedRoute requireAdmin><UserManagementDashboard /></ProtectedRoute>} />
                <Route path="/users" element={<ProtectedRoute requireAdmin><UserManagementPage /></ProtectedRoute>} />
                <Route path="/roles" element={<ProtectedRoute requireAdmin><GroupsPage /></ProtectedRoute>} />
                <Route path="/groups" element={<Navigate to="/roles" replace />} />
                <Route path="/admin/content" element={<ProtectedRoute requireAdmin><AdminContentOverview /></ProtectedRoute>} />
                <Route path="/categories" element={<Navigate to="/configuration" replace />} />
                <Route path="/configuration" element={<ProtectedRoute requireAdmin><ConfigurationPage /></ProtectedRoute>} />
                <Route path="/content" element={<ProtectedRoute><ContentManagement /></ProtectedRoute>} />
                <Route path="/courses" element={<ProtectedRoute><CourseManagement /></ProtectedRoute>} />
                <Route path="/courses/create" element={<ProtectedRoute><CourseCreator /></ProtectedRoute>} />
                <Route path="/courses/:id/edit" element={<ProtectedRoute><CourseCreator /></ProtectedRoute>} />
                <Route path="/articles" element={<ProtectedRoute><ArticleManagement /></ProtectedRoute>} />
                <Route path="/articles/create" element={<ProtectedRoute><ArticleCreator /></ProtectedRoute>} />
                <Route path="/articles/:id/edit" element={<ProtectedRoute><ArticleCreator /></ProtectedRoute>} />
                <Route path="/import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
                <Route path="/my-tasks" element={<ProtectedRoute><MyTasks /></ProtectedRoute>} />
                <Route path="/my-learning" element={<ProtectedRoute><MyLearning /></ProtectedRoute>} />
                <Route path="/notes-highlights" element={<ProtectedRoute><NotesHighlightsPage /></ProtectedRoute>} />
                <Route path="/analytics" element={<ProtectedRoute requireAdmin><Analytics /></ProtectedRoute>} />
                <Route path="/settings" element={<ProtectedRoute requireAdmin><Settings /></ProtectedRoute>} />
                <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
                <Route path="/account-settings" element={<ProtectedRoute><UserSettings /></ProtectedRoute>} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            </AppErrorBoundary>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
      </FeatureFlagProvider>
    </QueryClientProvider>
  </Provider>
);

export default App;
