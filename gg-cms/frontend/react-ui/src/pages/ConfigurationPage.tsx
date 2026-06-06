import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FolderTree, Tag as TagIcon, Settings2, Route, Target, Users } from 'lucide-react';
import { CategoriesTab } from '@/components/configuration/CategoriesTab';
import { TagsTab } from '@/components/configuration/TagsTab';
import { ContentTypesTab } from '@/components/configuration/ContentTypesTab';
import { LearningPathsTab } from '@/components/configuration/LearningPathsTab';
import { InterviewPathsTab } from '@/components/configuration/InterviewPathsTab';
import { ReviewerGroupsTab } from '@/components/configuration/ReviewerGroupsTab';

export default function ConfigurationPage() {
  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Configuration</h1>
          <p className="text-muted-foreground">
            Manage categories, tags, content types, and learning paths
          </p>
        </div>

        <Tabs defaultValue="categories">
          <TabsList className="flex-wrap h-auto gap-1">
            <TabsTrigger value="categories" className="gap-2">
              <FolderTree className="w-4 h-4" /> Categories
            </TabsTrigger>
            <TabsTrigger value="tags" className="gap-2">
              <TagIcon className="w-4 h-4" /> Tags
            </TabsTrigger>
            <TabsTrigger value="content-types" className="gap-2">
              <Settings2 className="w-4 h-4" /> Content Types
            </TabsTrigger>
            <TabsTrigger value="learning-paths" className="gap-2">
              <Route className="w-4 h-4" /> Learning Paths
            </TabsTrigger>
            <TabsTrigger value="interview-paths" className="gap-2">
              <Target className="w-4 h-4" /> Interview Paths
            </TabsTrigger>
            <TabsTrigger value="reviewer-groups" className="gap-2">
              <Users className="w-4 h-4" /> Reviewer Groups
            </TabsTrigger>
          </TabsList>

          <TabsContent value="categories" className="mt-6">
            <CategoriesTab />
          </TabsContent>

          <TabsContent value="tags" className="mt-6">
            <TagsTab />
          </TabsContent>

          <TabsContent value="content-types" className="mt-6">
            <ContentTypesTab />
          </TabsContent>

          <TabsContent value="learning-paths" className="mt-6">
            <LearningPathsTab />
          </TabsContent>

          <TabsContent value="interview-paths" className="mt-6">
            <InterviewPathsTab />
          </TabsContent>

          <TabsContent value="reviewer-groups" className="mt-6">
            <ReviewerGroupsTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}
