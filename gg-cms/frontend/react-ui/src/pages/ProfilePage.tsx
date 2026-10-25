import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OnboardingWizard } from '@/components/personalization/OnboardingWizard';
import { ProfileSwitcher } from '@/components/personalization/ProfileSwitcher';
import { useProfile } from '@/api/hooks/useProfile';
import { useMyEnrollments } from '@/api/hooks/useEnrollments';
import { useMyNotes, useMyHighlights, useMyFavourites } from '@/api/hooks/useEngagement';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { ProfileEditForm } from '@/components/settings/ProfileEditForm';
import { useSelfProfile } from '@/api/hooks/usePrivacy';
import { Mail, BookOpen, Award, Activity, StickyNote, Highlighter, Star } from 'lucide-react';

export default function ProfilePage() {
  const { user } = useAuth();
  const { data: learningProfile } = useProfile();
  const { data: self } = useSelfProfile();
  const { data: enrollments, isLoading: enrollmentsLoading, isError: enrollmentsError } = useMyEnrollments();
  const { data: notes, isLoading: notesLoading } = useMyNotes(0, 1);
  const { data: highlights, isLoading: highlightsLoading } = useMyHighlights(0, 1);
  const { data: favourites, isLoading: favouritesLoading } = useMyFavourites(0, 1);

  const displayName = user?.name || user?.email || '';
  const initials = displayName.split(' ').filter(Boolean).map((n) => n[0]).join('').slice(0, 2).toUpperCase();
  const statsLoading = enrollmentsLoading || notesLoading || highlightsLoading || favouritesLoading;

  const stats = [
    { label: 'Courses Enrolled', value: enrollments?.filter((e) => e.status !== 'dropped').length ?? 0, icon: BookOpen },
    { label: 'Courses Completed', value: enrollments?.filter((e) => e.status === 'completed').length ?? 0, icon: Award },
    { label: 'Notes', value: notes?.total ?? 0, icon: StickyNote },
    { label: 'Highlights', value: highlights?.total ?? 0, icon: Highlighter },
    { label: 'Favourites', value: favourites?.total ?? 0, icon: Star },
  ];

  const recentActivity = [...(enrollments ?? [])]
    .filter((e) => e.lastAccessedAt || e.enrolledAt)
    .sort((a, b) => new Date(b.lastAccessedAt ?? b.enrolledAt ?? 0).getTime() - new Date(a.lastAccessedAt ?? a.enrolledAt ?? 0).getTime())
    .slice(0, 8);

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">My Profile</h1>
          <p className="text-muted-foreground">Your account and learning preferences</p>
        </div>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-12 lg:col-span-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <Avatar className="w-24 h-24">
                    <AvatarImage src={self?.avatarUrl || user?.avatar} alt={displayName} />
                    <AvatarFallback className="text-2xl bg-primary text-primary-foreground">{initials}</AvatarFallback>
                  </Avatar>
                  <h2 className="mt-4 text-xl font-semibold">{displayName}</h2>
                  <Badge variant="secondary" className="mt-2">
                    {user?.role === 'admin' ? 'Administrator' : 'Member'}
                  </Badge>
                  <Separator className="my-4" />
                  <div className="w-full space-y-3 text-left text-sm">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                      <span>{user?.email}</span>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="mt-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Statistics</CardTitle>
              </CardHeader>
              <CardContent aria-live="polite">
                {statsLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : (
                  <div className="grid grid-cols-2 gap-4">
                    {stats.map((stat) => (
                      <div key={stat.label} className="text-center p-3 bg-muted/50 rounded-lg">
                        <stat.icon className="w-5 h-5 mx-auto text-primary mb-1" aria-hidden="true" />
                        <p className="text-2xl font-bold">{stat.value}</p>
                        <p className="text-xs text-muted-foreground">{stat.label}</p>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="col-span-12 lg:col-span-8">
            <Tabs defaultValue="learning">
              <TabsList>
                <TabsTrigger value="learning">Learning Profile</TabsTrigger>
                <TabsTrigger value="activity">Recent Activity</TabsTrigger>
                <TabsTrigger value="edit">Edit Profile</TabsTrigger>
              </TabsList>

              <TabsContent value="learning" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5" aria-hidden="true" />
                      Learning Profile
                    </CardTitle>
                    <CardDescription>
                      Set your experience level, role, and interests. Tags and categories are loaded from your content library.
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProfileSwitcher />
                    <OnboardingWizard
                      mode="api"
                      initialExperience={learningProfile?.experienceLevel}
                      initialRole={learningProfile?.roleType}
                      initialTagIds={learningProfile?.interestedTagIds}
                      initialCategoryIds={learningProfile?.preferredCategoryIds}
                      initialGoals={learningProfile?.learningGoals ?? ''}
                      initialName={learningProfile?.name}
                    />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="edit" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Edit Profile</CardTitle>
                    <CardDescription>Your name, contact and public details.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ProfileEditForm />
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="activity" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" aria-hidden="true" />
                      Recent Activity
                    </CardTitle>
                    <CardDescription>Your latest course activity</CardDescription>
                  </CardHeader>
                  <CardContent aria-live="polite">
                    {enrollmentsLoading ? (
                      <Skeleton className="h-24 w-full" />
                    ) : enrollmentsError ? (
                      <p role="alert" className="text-sm text-destructive">Could not load your activity.</p>
                    ) : recentActivity.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No activity yet. Enroll in a course to get started.</p>
                    ) : (
                      <div className="space-y-4">
                        {recentActivity.map((e) => (
                          <div key={e.id} className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg">
                            <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                            <div className="flex-1">
                              <p className="font-medium">{e.status === 'completed' ? 'Completed course' : 'Studying course'}</p>
                              <p className="text-sm text-muted-foreground">{e.course?.title ?? 'Course'} ({Math.round(e.progress)}%)</p>
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {new Date(e.lastAccessedAt ?? e.enrolledAt ?? '').toLocaleDateString()}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}
