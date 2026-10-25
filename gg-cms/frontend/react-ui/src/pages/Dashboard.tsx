import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { VisitorImportDialog } from '@/components/personalization/VisitorImportDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Users, UserCheck, UserX, UserPlus, Shield, UserCog, ArrowRight, CheckSquare, BookOpen,
  Bell, Sparkles, Zap, Flame, Compass, Bookmark, Clock, Layers, FileText, Settings2, BarChart3, Bot, Check, Target, Briefcase
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUsersQuery } from '@/api/hooks/useUsers';
import { useTasksQuery } from '@/api/hooks/useTasks';
import { useNotifications } from '@/api/hooks/useNotifications';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useDomains } from '@/api/hooks/useDomains';
import { useAnalyticsDashboard, useAnalyticsOverview } from '@/api/hooks/useAnalytics';
import { useMyHighlights, useMyNotes } from '@/api/hooks/useEngagement';
import { rangeFromDays } from '@/lib/analyticsHelpers';
import { UserDto } from '@/api/types';

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: usersData, isLoading: usersLoading } = useUsersQuery({ page: 0, size: 1 });
  const { data: publicCmsData } = usePublicCmsList({ size: 6 });
  const { data: domainsData } = useDomains();
  const { data: overview, isLoading: overviewLoading } = useAnalyticsOverview(rangeFromDays(30));
  const { data: analytics, isLoading: analyticsLoading } = useAnalyticsDashboard();

  const totalUsers = usersData?.totalElements ?? usersData?.total ?? 0;
  
  const featuredArticles = publicCmsData?.items ?? [];
  const domains = domainsData ?? [];

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* ── 1. Hero Gradient Header ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 border border-indigo-500/20 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-8 -mr-8 w-64 h-64 rounded-full bg-primary/20 blur-3xl pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 -mb-12 w-48 h-48 rounded-full bg-purple-500/20 blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-indigo-400/40 text-indigo-300 bg-indigo-500/10 text-xs font-semibold tracking-wide">
                <Sparkles className="w-3 h-3 mr-1 text-indigo-400 animate-pulse" />
                Admin Command Center
              </Badge>
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs font-medium">
                Operational
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Welcome back, {user?.name?.split(' ')[0] || 'Admin'}! 👋
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Your platform currently hosts <span className="font-semibold text-white">{domains.length} tech domains</span> with live automated content review pipelines.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">

            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/workspace/content')}
              className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl"
            >
              Workspace
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. Real-time Platform Metrics ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Total Members</CardTitle>
            <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-600 dark:text-indigo-400">
              <Users className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {usersLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-extrabold text-foreground">{totalUsers}</div>
            )}
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Tech Domains</CardTitle>
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Layers className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-foreground">{domains.length}</div>
            <p className="text-xs text-muted-foreground mt-2 truncate">{domains.slice(0, 5).map((d) => d.name).join(', ')}</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Published Articles</CardTitle>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <FileText className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-foreground">{publicCmsData?.total ?? featuredArticles.length}</div>
            <p className="text-xs text-muted-foreground mt-2">Live in the public library</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Active Users (30d)</CardTitle>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Shield className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {overviewLoading ? (
              <Skeleton className="h-8 w-20" />
            ) : (
              <div className="text-3xl font-extrabold text-foreground">{overview?.mau?.toLocaleString() ?? '-'}</div>
            )}
            <p className="text-xs text-muted-foreground mt-2">
              {analyticsLoading ? 'Loading page views' : (analytics?.pageViews30d ?? 0).toLocaleString() + ' page views'}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Quick Action Command Grid ──────────────────────────────────── */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Zap className="w-5 h-5 text-amber-500" />
          <span>Management Quick Launch</span>
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/workspace/courses">
            <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border-border/70">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 group-hover:scale-105 transition-transform">
                  <BookOpen className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Course Workspace</h3>
                  <p className="text-xs text-muted-foreground truncate">Build & manage technical courses</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/workspace/articles">
            <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border-border/70">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-sky-500/10 text-sky-600 dark:text-sky-400 group-hover:scale-105 transition-transform">
                  <FileText className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Article Creator</h3>
                  <p className="text-xs text-muted-foreground truncate">Draft, review & publish guides</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/workspace/configuration">
            <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border-border/70">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-purple-500/10 text-purple-600 dark:text-purple-400 group-hover:scale-105 transition-transform">
                  <Settings2 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Taxonomy & Config</h3>
                  <p className="text-xs text-muted-foreground truncate">Categories & Reviewer matrix</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/workspace/users">
            <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border-border/70">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 group-hover:scale-105 transition-transform">
                  <Users className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">User Management</h3>
                  <p className="text-xs text-muted-foreground truncate">Members, status & credentials</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/workspace/roles">
            <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border-border/70">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-amber-500/10 text-amber-600 dark:text-amber-400 group-hover:scale-105 transition-transform">
                  <Shield className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Roles & Governance</h3>
                  <p className="text-xs text-muted-foreground truncate">Group access & permission trees</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/workspace/analytics">
            <Card className="hover:border-primary/50 hover:shadow-md transition-all cursor-pointer group bg-card border-border/70">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-xl bg-rose-500/10 text-rose-600 dark:text-rose-400 group-hover:scale-105 transition-transform">
                  <BarChart3 className="w-6 h-6" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-bold text-foreground text-base group-hover:text-primary transition-colors">Analytics & Insights</h3>
                  <p className="text-xs text-muted-foreground truncate">Traffic & engagement telemetry</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
              </CardContent>
            </Card>
          </Link>
        </div>
      </div>
    </div>
  );
}

// ─── User Dashboard ───────────────────────────────────────────────────────────

function UserDashboard() {
  const { user, visitorProfileImported, clearVisitorImportFlag } = useAuth();
  const navigate = useNavigate();
  const { data: tasksData, isLoading: tasksLoading } = useTasksQuery({ page: 1, pageSize: 5 });
  const { data: notificationsData, isLoading: notifLoading } = useNotifications();
  const { data: publicCmsData } = usePublicCmsList({ size: 4 });
  const { data: notesData, isLoading: notesLoading } = useMyNotes(0, 1);
  const { data: highlightsData, isLoading: highlightsLoading } = useMyHighlights(0, 1);

  const tasks = tasksData?.items ?? [];
  const pendingTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed').length;
  const unreadNotifs = notificationsData?.items?.filter((n) => !n.read).length ?? 0;
  const articles = publicCmsData?.items ?? [];

  return (
    <div className="space-y-8 animate-fade-in pb-8">
      {/* Visitor profile import dialog */}
      <VisitorImportDialog open={visitorProfileImported} onKeep={clearVisitorImportFlag} />

      {/* ── 1. Hero Welcome Header ────────────────────────────────────────── */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 border border-sky-500/20 p-6 sm:p-8 text-white shadow-xl">
        <div className="absolute top-0 right-0 -mt-6 -mr-6 w-56 h-56 rounded-full bg-sky-500/20 blur-3xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="border-sky-400/40 text-sky-300 bg-sky-500/10 text-xs font-semibold">
                <Flame className="w-3.5 h-3.5 mr-1 text-amber-400" />
                Developer Workspace
              </Badge>
            </div>
            <h1 className="text-2xl sm:text-4xl font-extrabold tracking-tight text-white">
              Welcome back, {user?.name?.split(' ')[0] || 'Developer'}!
            </h1>
            <p className="text-slate-300 text-sm sm:text-base leading-relaxed">
              Explore hands-on tutorials, track assigned review tasks, or continue your active learning paths.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button 
              size="lg" 
              onClick={() => navigate('/workspace/articles')}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg gap-2 rounded-xl"
            >
              <FileText className="w-5 h-5" />
              Article Editor
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/workspace/courses')}
              className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl gap-2"
            >
              <BookOpen className="w-5 h-5" />
              Course Creator
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/workspace/configuration?tab=learning-paths')}
              className="border-amber-700 bg-amber-900/40 hover:bg-amber-800 text-amber-100 font-semibold rounded-xl gap-2"
            >
              <Layers className="w-5 h-5" />
              Path / Interview Maker
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/workspace/configuration')}
              className="border-indigo-700 bg-indigo-900/40 hover:bg-indigo-800 text-indigo-100 font-semibold rounded-xl gap-2"
            >
              <Settings2 className="w-5 h-5" />
              Configuration
            </Button>
          </div>
        </div>
      </div>

      {/* ── 2. Personal Learning Velocity ─────────────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Pending Review Tasks</CardTitle>
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
              <CheckSquare className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {tasksLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-extrabold text-foreground">{pendingTasks}</div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Action items assigned to you</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Notifications</CardTitle>
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
              <Bell className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {notifLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-extrabold text-foreground">{unreadNotifs}</div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Unread messages & alerts</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Saved Notes & Highlights</CardTitle>
            <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
              <Bookmark className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            {notesLoading || highlightsLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-3xl font-extrabold text-foreground">{(notesData?.total ?? 0) + (highlightsData?.total ?? 0)}</div>
            )}
            <p className="text-xs text-muted-foreground mt-2">Notes and highlights you saved</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
        <Card
          onClick={() => navigate('/practice')}
          className="border-border/60 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer bg-card"
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary"><Target className="w-5 h-5" /></div>
            <div>
              <div className="font-bold text-foreground">Practice Hub</div>
              <p className="text-xs text-muted-foreground">Test yourself with quizzes and assessments</p>
            </div>
          </CardContent>
        </Card>
        <Card
          onClick={() => navigate('/interview-prep')}
          className="border-border/60 shadow-sm hover:shadow-md hover:border-primary/40 transition-all cursor-pointer bg-card"
        >
          <CardContent className="p-5 flex items-center gap-4">
            <div className="p-2 rounded-lg bg-primary/10 text-primary"><Briefcase className="w-5 h-5" /></div>
            <div>
              <div className="font-bold text-foreground">Interview Prep</div>
              <p className="text-xs text-muted-foreground">Work through interview questions at your own pace</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── 3. Featured Reading for You ────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-primary" />
            <span>Recommended Reading for You</span>
          </h2>
          <Button variant="ghost" size="sm" onClick={() => navigate('/articles')} className="text-xs gap-1 font-semibold">
            View All <ArrowRight className="w-3.5 h-3.5" />
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {articles.map((item) => (
            <Card 
              key={item.id} 
              onClick={() => navigate(`/article/${item.slug}`)}
              className="border-border/70 hover:border-primary/40 hover:shadow-md transition-all cursor-pointer group bg-card overflow-hidden"
            >
              <CardContent className="p-4 flex gap-4">
                {item.thumbnailUrl && (
                  <img 
                    src={item.thumbnailUrl} 
                    alt={item.title} 
                    className="w-20 h-20 rounded-lg object-cover shrink-0 group-hover:scale-105 transition-transform" 
                  />
                )}
                <div className="flex-1 min-w-0 space-y-1">
                  <Badge variant="outline" className="text-[10px] border-primary/20 text-primary font-semibold">
                    {item.categoryName || 'Engineering'}
                  </Badge>
                  <h3 className="font-bold text-foreground text-sm line-clamp-1 group-hover:text-primary transition-colors">
                    {item.title}
                  </h3>
                  <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-40 w-full rounded-2xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map((i) => (
          <Card key={i}>
            <CardHeader className="pb-2">
              <Skeleton className="h-4 w-24" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-9 w-16" />
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}

// ─── Main Export ──────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { isAdmin, isGroupsLoading } = useAuth();

  return (
    <DashboardLayout>
      {isGroupsLoading ? (
        <DashboardSkeleton />
      ) : isAdmin ? (
        <AdminDashboard />
      ) : (
        <UserDashboard />
      )}
    </DashboardLayout>
  );
}
