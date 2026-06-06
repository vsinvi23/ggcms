import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Users, UserCheck, UserX, BookOpen, Activity, BarChart3 } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useUsersQuery } from '@/api/hooks/useUsers';
import { useCmsList } from '@/api/hooks/useCms';
import { useNotifications } from '@/api/hooks/useNotifications';
import { UserDto } from '@/api/types';

export default function Analytics() {
  const { data: usersData, isLoading: usersLoading } = useUsersQuery({ page: 0, size: 200 });
  const { data: articlesData, isLoading: articlesLoading } = useCmsList({ type: 'ARTICLE', page: 0, size: 1 });
  const { data: coursesData, isLoading: coursesLoading } = useCmsList({ type: 'COURSE', page: 0, size: 1 });
  const { data: notifData, isLoading: notifLoading } = useNotifications();

  const users: UserDto[] = usersData?.items ?? [];
  const totalUsers = usersData?.totalElements ?? usersData?.total ?? 0;
  const activeUsers = users.filter((u) => u.status?.toUpperCase() === 'ACTIVE').length;
  const deactivatedUsers = users.filter((u) =>
    ['INACTIVE', 'DEACTIVATED'].includes(u.status?.toUpperCase() ?? '')
  ).length;
  const totalArticles = articlesData?.total ?? 0;
  const totalCourses = coursesData?.total ?? 0;

  const userStatusData = [
    { name: 'Active', count: activeUsers },
    { name: 'Deactivated', count: deactivatedUsers },
    { name: 'Other', count: Math.max(0, totalUsers - activeUsers - deactivatedUsers) },
  ];

  const contentData = [
    { name: 'Articles', count: totalArticles },
    { name: 'Courses', count: totalCourses },
  ];

  const stats = [
    {
      title: 'Registered Users',
      value: totalUsers,
      icon: Users,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      loading: usersLoading,
    },
    {
      title: 'Active Users',
      value: activeUsers,
      icon: UserCheck,
      color: 'text-success',
      bgColor: 'bg-success/10',
      loading: usersLoading,
    },
    {
      title: 'Deactivated',
      value: deactivatedUsers,
      icon: UserX,
      color: 'text-destructive',
      bgColor: 'bg-destructive/10',
      loading: usersLoading,
    },
    {
      title: 'Total Content',
      value: totalArticles + totalCourses,
      icon: BookOpen,
      color: 'text-warning',
      bgColor: 'bg-warning/10',
      loading: articlesLoading || coursesLoading,
    },
  ];

  const notifications = notifData?.items ?? [];

  const tooltipStyle = {
    backgroundColor: 'hsl(var(--card))',
    border: '1px solid hsl(var(--border))',
    borderRadius: '8px',
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Analytics</h1>
          <p className="text-muted-foreground">User and content statistics</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.title}>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">
                    {stat.title}
                  </CardTitle>
                  <div className={`p-2 rounded-lg ${stat.bgColor}`}>
                    <Icon className={`h-4 w-4 ${stat.color}`} />
                  </div>
                </CardHeader>
                <CardContent>
                  {stat.loading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : (
                    <div className="text-2xl font-bold">{stat.value.toLocaleString()}</div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3 className="h-4 w-4" />
                User Status Breakdown
              </CardTitle>
              <CardDescription>Distribution of users by account status</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                {usersLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={userStatusData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Users" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BookOpen className="h-4 w-4" />
                Content Overview
              </CardTitle>
              <CardDescription>Total published articles and courses</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[220px]">
                {articlesLoading || coursesLoading ? (
                  <Skeleton className="h-full w-full" />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={contentData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis dataKey="name" className="text-xs" />
                      <YAxis className="text-xs" />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Bar dataKey="count" name="Items" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Activity className="h-4 w-4" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest system notifications and events</CardDescription>
          </CardHeader>
          <CardContent>
            {notifLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : notifications.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No recent activity</p>
            ) : (
              <div className="space-y-3 max-h-[320px] overflow-y-auto">
                {notifications.slice(0, 10).map((n) => (
                  <div
                    key={n.id}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-2 h-2 rounded-full ${n.read ? 'bg-muted-foreground' : 'bg-primary'}`}
                      />
                      <div>
                        <p className="text-sm font-medium">{n.title ?? 'Notification'}</p>
                        {n.message && (
                          <p className="text-xs text-muted-foreground">{n.message}</p>
                        )}
                      </div>
                    </div>
                    <Badge variant={n.read ? 'secondary' : 'default'}>
                      {n.read ? 'Read' : 'Unread'}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
