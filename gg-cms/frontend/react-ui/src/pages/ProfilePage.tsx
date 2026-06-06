import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { OnboardingWizard } from '@/components/personalization/OnboardingWizard';
import { ProfileSwitcher } from '@/components/personalization/ProfileSwitcher';
import { useProfile } from '@/api/hooks/useProfile';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import {
  User,
  Mail,
  Phone,
  MapPin,
  Briefcase,
  Calendar,
  Link as LinkIcon,
  Github,
  Linkedin,
  Twitter,
  Globe,
  Camera,
  Save,
  FileText,
  BookOpen,
  Award,
  Activity,
  Edit,
} from 'lucide-react';

interface ProfileData {
  name: string;
  email: string;
  phone: string;
  location: string;
  bio: string;
  jobTitle: string;
  company: string;
  website: string;
  github: string;
  linkedin: string;
  twitter: string;
}

export default function ProfilePage() {
  const { user } = useAuth();
  const { data: learningProfile } = useProfile();
  const [isEditing, setIsEditing] = useState(false);
  const [profileData, setProfileData] = useState<ProfileData>({
    name: user?.name || '',
    email: user?.email || '',
    phone: '+1 (555) 123-4567',
    location: 'San Francisco, CA',
    bio: 'Passionate developer with expertise in full-stack development. Love building scalable applications and mentoring others.',
    jobTitle: 'Senior Software Engineer',
    company: 'GeekGully',
    website: 'https://example.com',
    github: 'https://github.com/username',
    linkedin: 'https://linkedin.com/in/username',
    twitter: 'https://twitter.com/username',
  });

  const handleSave = () => {
    toast.success('Profile updated successfully');
    setIsEditing(false);
  };

  const stats = [
    { label: 'Articles Written', value: 24, icon: FileText },
    { label: 'Courses Created', value: 8, icon: BookOpen },
    { label: 'Contributions', value: 156, icon: Activity },
    { label: 'Achievements', value: 12, icon: Award },
  ];

  const recentActivity = [
    { action: 'Published article', title: 'Understanding React Hooks', date: '2 hours ago' },
    { action: 'Updated course', title: 'Advanced TypeScript Patterns', date: '5 hours ago' },
    { action: 'Reviewed content', title: 'Introduction to GraphQL', date: '1 day ago' },
    { action: 'Published article', title: 'CSS Grid Deep Dive', date: '2 days ago' },
    { action: 'Created course', title: 'Node.js Masterclass', date: '3 days ago' },
  ];

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-foreground">My Profile</h1>
            <p className="text-muted-foreground">Manage your personal information and preferences</p>
          </div>
          <Button onClick={() => (isEditing ? handleSave() : setIsEditing(true))}>
            {isEditing ? (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            ) : (
              <>
                <Edit className="w-4 h-4 mr-2" />
                Edit Profile
              </>
            )}
          </Button>
        </div>

        <div className="grid grid-cols-12 gap-6">
          {/* Profile Card */}
          <div className="col-span-12 lg:col-span-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-col items-center text-center">
                  <div className="relative">
                    <Avatar className="w-24 h-24">
                      <AvatarImage src={user?.avatar} />
                      <AvatarFallback className="text-2xl bg-primary text-primary-foreground">
                        {profileData.name.split(' ').map((n) => n[0]).join('').toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    {isEditing && (
                      <Button
                        size="icon"
                        variant="secondary"
                        className="absolute -bottom-1 -right-1 h-8 w-8 rounded-full"
                      >
                        <Camera className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                  <h2 className="mt-4 text-xl font-semibold">{profileData.name}</h2>
                  <p className="text-muted-foreground">{profileData.jobTitle}</p>
                  <Badge variant="secondary" className="mt-2">
                    {user?.role === 'admin' ? 'Administrator' : 'Member'}
                  </Badge>

                  <Separator className="my-4" />

                  <div className="w-full space-y-3 text-left text-sm">
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-muted-foreground" />
                      <span>{profileData.email}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-muted-foreground" />
                      <span>{profileData.phone}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <MapPin className="w-4 h-4 text-muted-foreground" />
                      <span>{profileData.location}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Briefcase className="w-4 h-4 text-muted-foreground" />
                      <span>{profileData.company}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <Calendar className="w-4 h-4 text-muted-foreground" />
                      <span>Joined January 2024</span>
                    </div>
                  </div>

                  <Separator className="my-4" />

                  {/* Social Links */}
                  <div className="flex gap-2">
                    {profileData.github && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={profileData.github} target="_blank" rel="noopener noreferrer">
                          <Github className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    {profileData.linkedin && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={profileData.linkedin} target="_blank" rel="noopener noreferrer">
                          <Linkedin className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    {profileData.twitter && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={profileData.twitter} target="_blank" rel="noopener noreferrer">
                          <Twitter className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                    {profileData.website && (
                      <Button variant="outline" size="icon" asChild>
                        <a href={profileData.website} target="_blank" rel="noopener noreferrer">
                          <Globe className="w-4 h-4" />
                        </a>
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Stats Card */}
            <Card className="mt-6">
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Statistics</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 gap-4">
                  {stats.map((stat) => (
                    <div key={stat.label} className="text-center p-3 bg-muted/50 rounded-lg">
                      <stat.icon className="w-5 h-5 mx-auto text-primary mb-1" />
                      <p className="text-2xl font-bold">{stat.value}</p>
                      <p className="text-xs text-muted-foreground">{stat.label}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Main Content */}
          <div className="col-span-12 lg:col-span-8">
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Profile Details</TabsTrigger>
                <TabsTrigger value="learning">Learning Profile</TabsTrigger>
                <TabsTrigger value="activity">Recent Activity</TabsTrigger>
              </TabsList>

              <TabsContent value="details" className="mt-6 space-y-6">
                {/* Basic Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <User className="w-5 h-5" />
                      Basic Information
                    </CardTitle>
                    <CardDescription>Your personal details and contact information</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="name">Full Name</Label>
                        <Input
                          id="name"
                          value={profileData.name}
                          onChange={(e) => setProfileData({ ...profileData, name: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="email">Email Address</Label>
                        <Input
                          id="email"
                          type="email"
                          value={profileData.email}
                          onChange={(e) => setProfileData({ ...profileData, email: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="phone">Phone Number</Label>
                        <Input
                          id="phone"
                          value={profileData.phone}
                          onChange={(e) => setProfileData({ ...profileData, phone: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="location">Location</Label>
                        <Input
                          id="location"
                          value={profileData.location}
                          onChange={(e) => setProfileData({ ...profileData, location: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="bio">Bio</Label>
                      <Textarea
                        id="bio"
                        value={profileData.bio}
                        onChange={(e) => setProfileData({ ...profileData, bio: e.target.value })}
                        disabled={!isEditing}
                        rows={4}
                      />
                    </div>
                  </CardContent>
                </Card>

                {/* Professional Info */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Briefcase className="w-5 h-5" />
                      Professional Information
                    </CardTitle>
                    <CardDescription>Your job title and company details</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="jobTitle">Job Title</Label>
                        <Input
                          id="jobTitle"
                          value={profileData.jobTitle}
                          onChange={(e) => setProfileData({ ...profileData, jobTitle: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="company">Company</Label>
                        <Input
                          id="company"
                          value={profileData.company}
                          onChange={(e) => setProfileData({ ...profileData, company: e.target.value })}
                          disabled={!isEditing}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Social Links */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <LinkIcon className="w-5 h-5" />
                      Social Links
                    </CardTitle>
                    <CardDescription>Connect your social profiles</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="website" className="flex items-center gap-2">
                          <Globe className="w-4 h-4" />
                          Website
                        </Label>
                        <Input
                          id="website"
                          value={profileData.website}
                          onChange={(e) => setProfileData({ ...profileData, website: e.target.value })}
                          disabled={!isEditing}
                          placeholder="https://yourwebsite.com"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="github" className="flex items-center gap-2">
                          <Github className="w-4 h-4" />
                          GitHub
                        </Label>
                        <Input
                          id="github"
                          value={profileData.github}
                          onChange={(e) => setProfileData({ ...profileData, github: e.target.value })}
                          disabled={!isEditing}
                          placeholder="https://github.com/username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="linkedin" className="flex items-center gap-2">
                          <Linkedin className="w-4 h-4" />
                          LinkedIn
                        </Label>
                        <Input
                          id="linkedin"
                          value={profileData.linkedin}
                          onChange={(e) => setProfileData({ ...profileData, linkedin: e.target.value })}
                          disabled={!isEditing}
                          placeholder="https://linkedin.com/in/username"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="twitter" className="flex items-center gap-2">
                          <Twitter className="w-4 h-4" />
                          Twitter
                        </Label>
                        <Input
                          id="twitter"
                          value={profileData.twitter}
                          onChange={(e) => setProfileData({ ...profileData, twitter: e.target.value })}
                          disabled={!isEditing}
                          placeholder="https://twitter.com/username"
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>

              <TabsContent value="learning" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BookOpen className="w-5 h-5" />
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

              <TabsContent value="activity" className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Activity className="w-5 h-5" />
                      Recent Activity
                    </CardTitle>
                    <CardDescription>Your latest actions and contributions</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {recentActivity.map((activity, index) => (
                        <div
                          key={index}
                          className="flex items-start gap-4 p-4 bg-muted/50 rounded-lg"
                        >
                          <div className="w-2 h-2 mt-2 rounded-full bg-primary" />
                          <div className="flex-1">
                            <p className="font-medium">{activity.action}</p>
                            <p className="text-sm text-muted-foreground">{activity.title}</p>
                          </div>
                          <span className="text-xs text-muted-foreground">{activity.date}</span>
                        </div>
                      ))}
                    </div>
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