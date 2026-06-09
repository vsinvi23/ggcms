import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { VisitorImportDialog } from '@/components/personalization/VisitorImportDialog';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserCheck, UserX, UserPlus, Shield, UserCog, ArrowRight, CheckSquare, BookOpen, Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useUsersQuery } from '@/api/hooks/useUsers';
import { useTasksQuery } from '@/api/hooks/useTasks';
import { useNotifications } from '@/api/hooks/useNotifications';
import { UserDto } from '@/api/types';

// ─── Admin Dashboard ──────────────────────────────────────────────────────────

function AdminDashboard() {
  const { data: usersData, isLoading } = useUsersQuery({ page: 0, size: 200 });

  const users: UserDto[] = usersData?.items ?? [];
  const totalUsers = usersData?.totalElements ?? usersData?.total ?? users.length;
  const activeUsers = users.filter((u) => u.status?.toUpperCase() === 'ACTIVE').length;
  const deactivatedUsers = users.filter(
    (u) => u.status?.toUpperCase() === 'INACTIVE' || u.status?.toUpperCase() === 'DEACTIVATED'
  ).length;
  const pendingUsers = users.filter((u) => u.status?.toUpperCase() === 'PENDING').length;

  const stats = [
    { title: 'Total Users', value: totalUsers, icon: Users, color: 'text-primary', bgColor: 'bg-primary/10' },
    { title: 'Active Users', value: activeUsers, icon: UserCheck, color: 'text-success', bgColor: 'bg-success/10' },
    { title: 'Deactivated', value: deactivatedUsers, icon: UserX, color: 'text-destructive', bgColor: 'bg-destructive/10' },
    { title: 'Pending Invites', value: pendingUsers, icon: UserPlus, color: 'text-warning', bgColor: 'bg-warning/10' },
  ];

  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Admin Dashboard</h1>
        <p className="text-muted-foreground mt-1">Overview of user management and system statistics</p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="hover:shadow-md transition-shadow">
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">{stat.title}</CardTitle>
                <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-9 w-16" />
                ) : (
                  <span className="text-3xl font-bold">{stat.value}</span>
                )}
                <p className="text-xs text-muted-foreground mt-1">from live data</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <Link to="/users">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <Users className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Manage Users</h3>
                  <p className="text-sm text-muted-foreground">View and manage all users</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/groups">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-warning/10">
                  <Shield className="w-6 h-6 text-warning" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Roles & Permissions</h3>
                  <p className="text-sm text-muted-foreground">Configure access levels</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/user-management">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-success/10">
                  <UserCog className="w-6 h-6 text-success" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">User Dashboard</h3>
                  <p className="text-sm text-muted-foreground">Overview & analytics</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── User Dashboard ───────────────────────────────────────────────────────────

function UserDashboard() {
  const { user, visitorProfileImported, clearVisitorImportFlag } = useAuth();
  const { data: tasksData, isLoading: tasksLoading } = useTasksQuery({ page: 1, pageSize: 5 });
  const { data: notificationsData, isLoading: notifLoading } = useNotifications();

  const tasks = tasksData?.items ?? [];
  const pendingTasks = tasks.filter((t) => t.status !== 'done' && t.status !== 'completed').length;
  const unreadNotifs = notificationsData?.items?.filter((n) => !n.read).length ?? 0;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Visitor profile import dialog */}
      <VisitorImportDialog open={visitorProfileImported} onKeep={clearVisitorImportFlag} />

      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          Welcome back{user?.name ? `, ${user.name.split(' ')[0]}` : ''}!
        </h1>
        <p className="text-muted-foreground mt-1">Here's what's happening with your learning journey.</p>
      </div>

      {/* Personal Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Pending Tasks</CardTitle>
            <div className="p-2 rounded-lg bg-warning/10">
              <CheckSquare className="w-4 h-4 text-warning" />
            </div>
          </CardHeader>
          <CardContent>
            {tasksLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <span className="text-3xl font-bold">{pendingTasks}</span>
            )}
            <p className="text-xs text-muted-foreground mt-1">tasks awaiting action</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Notifications</CardTitle>
            <div className="p-2 rounded-lg bg-primary/10">
              <Bell className="w-4 h-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            {notifLoading ? (
              <Skeleton className="h-9 w-16" />
            ) : (
              <span className="text-3xl font-bold">{unreadNotifs}</span>
            )}
            <p className="text-xs text-muted-foreground mt-1">unread notifications</p>
          </CardContent>
        </Card>

        <Card className="hover:shadow-md transition-shadow">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">My Content</CardTitle>
            <div className="p-2 rounded-lg bg-success/10">
              <BookOpen className="w-4 h-4 text-success" />
            </div>
          </CardHeader>
          <CardContent>
            <span className="text-3xl font-bold">{tasksData?.total ?? tasks.length}</span>
            <p className="text-xs text-muted-foreground mt-1">total assigned items</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Link to="/my-tasks">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-warning/10">
                  <CheckSquare className="w-6 h-6 text-warning" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">My Tasks</h3>
                  <p className="text-sm text-muted-foreground">Review content assigned to you</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>

          <Link to="/courses">
            <Card className="hover:bg-accent/50 transition-colors cursor-pointer group">
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 rounded-lg bg-primary/10">
                  <BookOpen className="w-6 h-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold">Browse Courses</h3>
                  <p className="text-sm text-muted-foreground">Explore available courses</p>
                </div>
                <ArrowRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors" />
              </CardContent>
            </Card>
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}

// ─── Loading Skeleton ─────────────────────────────────────────────────────────

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-72" />
      </div>
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
