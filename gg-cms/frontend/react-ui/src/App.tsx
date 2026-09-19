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
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const TechnologyPage = lazy(() => import('./pages/TechnologyPage'));
const TechnologiesPage = lazy(() => import('./pages/TechnologiesPage'));
const DomainsPage = lazy(() => import('./pages/DomainsPage'));
const CoursesPage = lazy(() => import('./pages/CoursesPage'));
const LearningPathsHub = lazy(() => import('./pages/LearningPathsHub'));
const ExplorePage = lazy(() => import('./pages/ExplorePage'));
const PracticeHub = lazy(() => import('./pages/PracticeHub'));
const InterviewPrepHub = lazy(() => import('./pages/InterviewPrepHub'));
const CourseCategoryPage = lazy(() => import('./pages/CourseCategoryPage'));
const SearchResults = lazy(() => import('./pages/SearchResults'));
const LearningPathPage = lazy(() => import('./pages/LearningPathPage'));
const TopicsPage = lazy(() => import('./pages/TopicsPage'));
const TopicDetailPage = lazy(() => import('./pages/TopicDetailPage'));
const ArticleViewPage = lazy(() => import('./pages/ArticleViewPage'));
const CourseViewPage = lazy(() => import('./pages/CourseViewPage'));
const PublicArticleView = lazy(() => import('./pages/PublicArticleView'));
const PublicCourseView = lazy(() => import('./pages/PublicCourseView'));
const MyLearning = lazy(() => import('./pages/MyLearning'));
const NotesHighlightsPage = lazy(() => import('./pages/NotesHighlightsPage'));
const OAuthCallback = lazy(() => import('./pages/OAuthCallback'));
const NotFound = lazy(() => import('./pages/NotFound'));
const BulkImport = lazy(() => import('./pages/BulkImport'));
const FactoryPage = lazy(() => import('./pages/FactoryPage'));

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
                {/* Public Clean Intent Routes */}
                <Route path="/" element={<PublicHome />} />
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/callback" element={<OAuthCallback />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/search" element={<SearchResults />} />
                
                {/* Intent-Driven Pages */}
                <Route path="/courses" element={<CoursesPage />} />
                <Route path="/learning-paths" element={<LearningPathsHub />} />
                <Route path="/explore" element={<ExplorePage />} />
                <Route path="/practice" element={<PracticeHub />} />
                <Route path="/interview-prep" element={<InterviewPrepHub />} />
                <Route path="/technologies" element={<TechnologiesPage />} />
                <Route path="/domains" element={<DomainsPage />} />
                
                <Route path="/technology/:slug" element={<TechnologyPage />} />
                <Route path="/explore/articles" element={<ExplorePage />} />
                <Route path="/explore/courses" element={<Navigate to="/courses" replace />} />
                <Route path="/explore/paths" element={<Navigate to="/learning-paths" replace />} />
                <Route path="/explore/:category" element={<ExplorePage />} />
                <Route path="/articles" element={<ExplorePage />} />
                <Route path="/article/*" element={<PublicArticleView />} />
                <Route path="/course/*" element={<CourseViewPage />} />
                <Route path="/learn/:path" element={<LearningPathPage />} />
                <Route path="/topics" element={<TopicsPage />} />
                <Route path="/topics/:slug" element={<TopicDetailPage />} />

                {/* Protected Workspace / Management Routes */}
                <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                <Route path="/dashboard/import" element={<ProtectedRoute><BulkImport /></ProtectedRoute>} />
                <Route path="/dashboard/content" element={<ProtectedRoute><ContentManagement /></ProtectedRoute>} />
                <Route path="/dashboard/courses" element={<ProtectedRoute><CourseManagement /></ProtectedRoute>} />
                <Route path="/dashboard/courses/create" element={<ProtectedRoute><CourseCreator /></ProtectedRoute>} />
                <Route path="/dashboard/courses/:id/edit" element={<ProtectedRoute><CourseCreator /></ProtectedRoute>} />
                <Route path="/dashboard/articles" element={<ProtectedRoute><ArticleManagement /></ProtectedRoute>} />
                <Route path="/dashboard/articles/create" element={<ProtectedRoute><ArticleCreator /></ProtectedRoute>} />
                <Route path="/dashboard/users" element={<ProtectedRoute requireAdmin><UserManagementDashboard /></ProtectedRoute>} />
                <Route path="/dashboard/roles" element={<ProtectedRoute requireAdmin><GroupsPage /></ProtectedRoute>} />
                <Route path="/dashboard/content-overview" element={<ProtectedRoute requireAdmin><AdminContentOverview /></ProtectedRoute>} />
                <Route path="/dashboard/configuration" element={<ProtectedRoute requireAdmin><ConfigurationPage /></ProtectedRoute>} />
                <Route path="/dashboard/analytics" element={<ProtectedRoute requireAdmin><Analytics /></ProtectedRoute>} />

                <Route path="/workspace/content" element={<ProtectedRoute><ContentManagement /></ProtectedRoute>} />
                <Route path="/workspace/courses" element={<ProtectedRoute><CourseManagement /></ProtectedRoute>} />
                <Route path="/workspace/courses/create" element={<ProtectedRoute><CourseCreator /></ProtectedRoute>} />
                <Route path="/workspace/courses/:id/edit" element={<ProtectedRoute><CourseCreator /></ProtectedRoute>} />
                <Route path="/workspace/articles" element={<ProtectedRoute><ArticleManagement /></ProtectedRoute>} />
                <Route path="/workspace/articles/create" element={<ProtectedRoute><ArticleCreator /></ProtectedRoute>} />
                <Route path="/workspace/users" element={<ProtectedRoute requireAdmin><UserManagementDashboard /></ProtectedRoute>} />
                <Route path="/workspace/roles" element={<ProtectedRoute requireAdmin><GroupsPage /></ProtectedRoute>} />
                <Route path="/workspace/content-overview" element={<ProtectedRoute requireAdmin><AdminContentOverview /></ProtectedRoute>} />
                <Route path="/workspace/configuration" element={<ProtectedRoute requireAdmin><ConfigurationPage /></ProtectedRoute>} />
                <Route path="/workspace/analytics" element={<ProtectedRoute requireAdmin><Analytics /></ProtectedRoute>} />
                
                {/* Legacy & Shortcut Alias Redirects */}
                <Route path="/admin" element={<Navigate to="/dashboard" replace />} />
                <Route path="/admin/*" element={<Navigate to="/dashboard" replace />} />
                <Route path="/content" element={<Navigate to="/workspace/content" replace />} />
                <Route path="/user-management" element={<Navigate to="/workspace/users" replace />} />
                <Route path="/users" element={<Navigate to="/workspace/users" replace />} />
                <Route path="/roles" element={<Navigate to="/workspace/roles" replace />} />
                <Route path="/groups" element={<Navigate to="/workspace/roles" replace />} />
                <Route path="/categories" element={<Navigate to="/workspace/configuration" replace />} />
                <Route path="/configuration" element={<Navigate to="/workspace/configuration" replace />} />
                <Route path="/import" element={<Navigate to="/dashboard/import" replace />} />
                <Route path="/admin/import" element={<Navigate to="/dashboard/import" replace />} />
                <Route path="/bulk-import" element={<Navigate to="/dashboard/import" replace />} />
                <Route path="/my-tasks" element={<ProtectedRoute><MyTasks /></ProtectedRoute>} />
                <Route path="/my-learning" element={<ProtectedRoute><MyLearning /></ProtectedRoute>} />
                <Route path="/notes-highlights" element={<ProtectedRoute><NotesHighlightsPage /></ProtectedRoute>} />
                <Route path="/analytics" element={<Navigate to="/workspace/analytics" replace />} />
                <Route path="/factory" element={<ProtectedRoute requireAdmin><FactoryPage /></ProtectedRoute>} />
                <Route path="/factory/*" element={<ProtectedRoute requireAdmin><FactoryPage /></ProtectedRoute>} />
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
