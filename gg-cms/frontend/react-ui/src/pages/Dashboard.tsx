import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { VisitorImportDialog } from '@/components/personalization/VisitorImportDialog';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Users, UserCheck, UserX, UserPlus, Shield, UserCog, ArrowRight, CheckSquare, BookOpen,
  Bell, Sparkles, Zap, Flame, Compass, Bookmark, Clock, Layers, FileText, Settings2, BarChart3, Bot, Check
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUsersQuery } from '@/api/hooks/useUsers';
import { useTasksQuery } from '@/api/hooks/useTasks';
import { useNotifications } from '@/api/hooks/useNotifications';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useDomains } from '@/api/hooks/useDomains';
import { UserDto } from '@/api/types';

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: usersData, isLoading: usersLoading } = useUsersQuery({ page: 0, size: 200 });
  const { data: publicCmsData } = usePublicCmsList({ page: 1, pageSize: 6 });
  const { data: domainsData } = useDomains();

  const users: UserDto[] = usersData?.items ?? [];
  const totalUsers = usersData?.totalElements ?? usersData?.total ?? users.length;
  const activeUsers = users.filter((u) => u.status?.toUpperCase() === 'ACTIVE').length;
  const pendingUsers = users.filter((u) => u.status?.toUpperCase() === 'PENDING').length;
  
  const featuredArticles = publicCmsData?.data ?? [];
  const domains = domainsData?.data ?? [];

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
              Your platform currently hosts <span className="font-semibold text-white">{domains.length || 5} tech domains</span> with live automated content review pipelines.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <Button 
              size="lg" 
              onClick={() => navigate('/factory')}
              className="bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white font-bold shadow-lg shadow-indigo-500/25 border border-indigo-400/30 gap-2 rounded-xl"
            >
              <Bot className="w-5 h-5 text-indigo-200" />
              AI Content Factory
            </Button>
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
            <div className="flex items-center gap-1.5 mt-2 text-xs text-muted-foreground">
              <span className="text-emerald-500 font-bold">● {activeUsers} active</span>
              <span>•</span>
              <span>{pendingUsers} pending</span>
            </div>
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
            <div className="text-3xl font-extrabold text-foreground">{domains.length || 5}</div>
            <p className="text-xs text-muted-foreground mt-2">Cloud, DevOps, AI, Security, Data</p>
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
            <div className="text-3xl font-extrabold text-foreground">{publicCmsData?.meta?.pagination?.total ?? featuredArticles.length}</div>
            <p className="text-xs text-muted-foreground mt-2">Peer-reviewed technical guides</p>
          </CardContent>
        </Card>

        <Card className="border-border/60 shadow-sm hover:shadow-md transition-all bg-card">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Security & Roles</CardTitle>
            <div className="p-2 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400">
              <Shield className="w-5 h-5" />
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="text-3xl font-extrabold text-foreground">3-Tier IA</div>
            <p className="text-xs text-muted-foreground mt-2">Group & Category matrix live</p>
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
  const { data: publicCmsData } = usePublicCmsList({ page: 1, pageSize: 4 });

  const tasks = tasksData?.items ?? [];
  const pendingTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed').length;
  const unreadNotifs = notificationsData?.items?.filter((n) => !n.read).length ?? 0;
  const articles = publicCmsData?.data ?? [];

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
              <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-xs font-medium">
                Active Streak: 5 Days 🔥
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
              onClick={() => navigate('/articles')}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold shadow-lg gap-2 rounded-xl"
            >
              <Compass className="w-5 h-5" />
              Explore Articles
            </Button>
            <Button 
              variant="outline" 
              size="lg"
              onClick={() => navigate('/courses')}
              className="border-slate-700 bg-slate-800/80 hover:bg-slate-800 text-slate-200 font-semibold rounded-xl"
            >
              Courses
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
            <div className="text-3xl font-extrabold text-foreground">Active</div>
            <p className="text-xs text-muted-foreground mt-2">Personal code snippets saved</p>
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
