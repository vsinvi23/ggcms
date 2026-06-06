import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useUsersQuery } from '@/api/hooks/useUsers';
import { UserDto } from '@/api/types';
import { useMemo } from 'react';
import {
  Users,
  UserCheck,
  UserX,
  UserPlus,
  TrendingUp,
  Shield,
  Clock,
  Activity,
  AlertCircle,
} from 'lucide-react';
import { format } from 'date-fns';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';

const getInitials = (name: string): string => {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
  return (parts[0]?.[0] ?? '?').toUpperCase();
};

export default function UserManagementDashboard() {
  const { data: usersData, isLoading, error } = useUsersQuery({ page: 0, size: 200 });

  const users: UserDto[] = usersData?.items ?? [];

  const totalUsers = usersData?.totalElements ?? usersData?.total ?? users.length;
  const activeCount = users.filter((u) => u.status?.toUpperCase() === 'ACTIVE').length;
  const deactivatedCount = users.filter(
    (u) => u.status?.toUpperCase() === 'INACTIVE' || u.status?.toUpperCase() === 'DEACTIVATED'
  ).length;
  const pendingCount = users.filter((u) => u.status?.toUpperCase() === 'PENDING').length;

  // Group distribution by first group name
  const groupDistribution = useMemo(() => {
    const dist: Record<string, number> = {};
    users.forEach((user) => {
      const groupName = user.groups?.[0] ?? 'No Group';
      dist[groupName] = (dist[groupName] ?? 0) + 1;
    });
    return dist;
  }, [users]);

  // Recent users — sorted by createdAt descending, take 5
  const recentUsers = useMemo(() => {
    return [...users]
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
      .slice(0, 5);
  }, [users]);

  // Recently active users — those with a lastLogin, sorted by lastLogin descending
  const recentlyActiveUsers = useMemo(() => {
    return users
      .filter((u) => !!u.lastLogin)
      .sort((a, b) => new Date(b.lastLogin!).getTime() - new Date(a.lastLogin!).getTime())
      .slice(0, 5);
  }, [users]);

  const stats = [
    {
      title: 'Total Users',
      value: totalUsers,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: 'All registered users',
    },
    {
      title: 'Active Users',
      value: activeCount,
      icon: UserCheck,
      color: 'text-success',
      bgColor: 'bg-success/10',
      description: 'Currently active accounts',
    },
    {
      title: 'Deactivated',
      value: deactivatedCount,
      icon: UserX,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      description: 'Suspended accounts',
    },
    {
      title: 'Pending Invites',
      value: pendingCount,
      icon: UserPlus,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      description: 'Awaiting acceptance',
    },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Page Header */}
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">User Management Overview</h1>
            <p className="text-muted-foreground mt-1">
              Monitor user activity, roles distribution, and manage access across the platform
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" asChild>
              <Link to="/roles">Manage Groups</Link>
            </Button>
            <Button asChild>
              <Link to="/users">View All Users</Link>
            </Button>
          </div>
        </div>

        {/* Error State */}
        {error && (
          <Card className="border-destructive/50 bg-destructive/5">
            <CardContent className="p-4 flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-destructive flex-shrink-0" />
              <p className="text-sm text-destructive">
                Failed to load user data. Please try refreshing the page.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title} className="hover:shadow-md transition-shadow">
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`w-4 h-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-9 w-16" />
                  ) : (
                    <div className="text-3xl font-bold">{stat.value}</div>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">{stat.description}</p>
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Group Distribution */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Shield className="w-5 h-5 text-primary" />
                Group Distribution
              </CardTitle>
              <CardDescription>Users by group membership</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((n) => (
                    <div key={n} className="space-y-2">
                      <Skeleton className="h-4 w-full" />
                      <Skeleton className="h-2 w-full" />
                    </div>
                  ))}
                </div>
              ) : Object.keys(groupDistribution).length === 0 ? (
                <p className="text-sm text-muted-foreground">No users found</p>
              ) : (
                Object.entries(groupDistribution).map(([groupName, count]) => {
                  const pct = users.length > 0 ? Math.round((count / users.length) * 100) : 0;
                  return (
                    <div key={groupName} className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge variant="outline" className="text-xs">{groupName}</Badge>
                        <span className="text-sm text-muted-foreground">
                          {count} users ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary rounded-full transition-all duration-500"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </CardContent>
          </Card>

          {/* Recent Users */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-success" />
                Recent Users
              </CardTitle>
              <CardDescription>Newly registered accounts</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-24" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {recentUsers.map((user) => (
                    <div key={user.id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                          {getInitials(user.name ?? user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{user.email}</p>
                      </div>
                      <div className="text-right">
                        {user.groups?.[0] && (
                          <Badge variant="outline" className="text-[10px] px-1.5">
                            {user.groups[0]}
                          </Badge>
                        )}
                        <p className="text-xs text-muted-foreground mt-1">
                          {format(new Date(user.createdAt), 'MMM d')}
                        </p>
                      </div>
                    </div>
                  ))}
                  {recentUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No users found</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recently Active */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Activity className="w-5 h-5 text-info" />
                Recently Active
              </CardTitle>
              <CardDescription>Latest user activity</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-4">
                  {[1, 2, 3, 4, 5].map((n) => (
                    <div key={n} className="flex items-center gap-3">
                      <Skeleton className="h-9 w-9 rounded-full" />
                      <div className="flex-1 space-y-1">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-3 w-40" />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-4">
                  {recentlyActiveUsers.map((user) => (
                    <div key={user.id} className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarFallback className="bg-muted text-muted-foreground text-xs">
                          {getInitials(user.name ?? user.email)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{user.name}</p>
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          <span>
                            Last login: {format(new Date(user.lastLogin!), 'MMM d, h:mm a')}
                          </span>
                        </div>
                      </div>
                      <div className="w-2 h-2 rounded-full bg-success" title="Active" />
                    </div>
                  ))}
                  {recentlyActiveUsers.length === 0 && (
                    <p className="text-sm text-muted-foreground">No recent activity</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <TrendingUp className="w-5 h-5" />
              Quick Actions
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/users">
                  <Users className="w-5 h-5" />
                  <span>Manage All Users</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2" asChild>
                <Link to="/roles">
                  <Shield className="w-5 h-5" />
                  <span>Manage Groups</span>
                </Link>
              </Button>
              <Button variant="outline" className="h-auto py-4 flex-col gap-2">
                <UserPlus className="w-5 h-5" />
                <span>Invite New User</span>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
