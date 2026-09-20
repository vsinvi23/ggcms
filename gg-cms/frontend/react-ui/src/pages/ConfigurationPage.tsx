import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  FolderTree, Tag as TagIcon, Settings2, Route, Target, Users,
  Layers, ListFilter, BookOpen, ShieldCheck, ShieldAlert,
} from 'lucide-react';
import { CategoriesTab } from '@/components/configuration/CategoriesTab';
import { TagsTab } from '@/components/configuration/TagsTab';
import { ContentTypesTab } from '@/components/configuration/ContentTypesTab';
import { LearningPathsTab } from '@/components/configuration/LearningPathsTab';
import { InterviewPathsTab } from '@/components/configuration/InterviewPathsTab';
import { ReviewerGroupsTab } from '@/components/configuration/ReviewerGroupsTab';
import { ErrorAuditLogsTab } from '@/components/configuration/ErrorAuditLogsTab';
import { cn } from '@/lib/utils';

export default function ConfigurationPage() {
  const [viewMode, setViewMode] = useState<'3tier' | 'classic'>(() => {
    const saved = localStorage.getItem('admin_config_view_mode');
    return saved === 'classic' ? 'classic' : '3tier';
  });

  const [activeTab, setActiveTab] = useState<string>('categories');

  const handleViewModeChange = (mode: '3tier' | 'classic') => {
    setViewMode(mode);
    localStorage.setItem('admin_config_view_mode', mode);
  };

  return (
    <DashboardLayout>
      <div className="space-y-6">
        {/* Page Header with Dual View Switcher */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-border/60">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground flex items-center gap-2.5">
              Configuration
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              System maintenance, taxonomy definitions, editorial path planning, and reviewer governance
            </p>
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border shrink-0">
            <Button
              variant={viewMode === '3tier' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('3tier')}
              className={cn(
                'gap-2 text-xs font-semibold h-8 rounded-lg transition-all',
                viewMode === '3tier' ? 'shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Layers className="w-3.5 h-3.5 text-cyan-500" /> 3-Tier View
            </Button>
            <Button
              variant={viewMode === 'classic' ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleViewModeChange('classic')}
              className={cn(
                'gap-2 text-xs font-semibold h-8 rounded-lg transition-all',
                viewMode === 'classic' ? 'shadow-xs' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <ListFilter className="w-3.5 h-3.5" /> Classic View
            </Button>
          </div>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          {/* 3-Tier Grouped View Navigation */}
          {viewMode === '3tier' ? (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              {/* Tier 1: Content Model */}
              <div className="p-4 rounded-2xl border border-border/80 bg-card hover:border-cyan-500/30 transition-all space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400 flex items-center gap-1.5">
                    <Layers className="w-3.5 h-3.5" /> Tier 1: Content Model
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full">
                    Taxonomy
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('categories')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                      activeTab === 'categories'
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <FolderTree className="w-3.5 h-3.5" /> Categories
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('tags')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                      activeTab === 'tags'
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <TagIcon className="w-3.5 h-3.5" /> Tags
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('content-types')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                      activeTab === 'content-types'
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <Settings2 className="w-3.5 h-3.5" /> Content Types
                  </button>
                </div>
              </div>

              {/* Tier 2: Editorial Products */}
              <div className="p-4 rounded-2xl border border-border/80 bg-card hover:border-amber-500/30 transition-all space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
                    <BookOpen className="w-3.5 h-3.5" /> Tier 2: Editorial Products
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full">
                    Bundles
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('learning-paths')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                      activeTab === 'learning-paths'
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <Route className="w-3.5 h-3.5" /> Learning Paths
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('interview-paths')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                      activeTab === 'interview-paths'
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <Target className="w-3.5 h-3.5" /> Interview Paths
                  </button>
                </div>
              </div>

              {/* Tier 3: Workflow & Governance */}
              <div className="p-4 rounded-2xl border border-border/80 bg-card hover:border-emerald-500/30 transition-all space-y-3 shadow-2xs">
                <div className="flex items-center justify-between border-b border-border/40 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5" /> Tier 3: Governance
                  </span>
                  <span className="text-[10px] font-semibold text-muted-foreground bg-muted/80 px-2 py-0.5 rounded-full">
                    Quality
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setActiveTab('reviewer-groups')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                      activeTab === 'reviewer-groups'
                        ? 'bg-primary text-primary-foreground border-primary shadow-xs'
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <Users className="w-3.5 h-3.5" /> Reviewer Groups
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab('error-logs')}
                    className={cn(
                      'px-3 py-1.5 text-xs font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer border',
                      activeTab === 'error-logs'
                        ? 'bg-destructive text-destructive-foreground border-destructive shadow-xs'
                        : 'bg-muted/40 hover:bg-muted text-muted-foreground hover:text-foreground border-transparent',
                    )}
                  >
                    <ShieldAlert className="w-3.5 h-3.5 text-destructive" /> Error Audit Logs
                  </button>
                </div>
              </div>
            </div>
          ) : (
            /* Classic Flat Tab View */
            <TabsList className="flex-wrap h-auto gap-1 mb-6 p-1.5 rounded-xl bg-card border border-border">
              <TabsTrigger value="categories" className="gap-2 rounded-lg text-xs font-semibold">
                <FolderTree className="w-4 h-4" /> Categories
              </TabsTrigger>
              <TabsTrigger value="tags" className="gap-2 rounded-lg text-xs font-semibold">
                <TagIcon className="w-4 h-4" /> Tags
              </TabsTrigger>
              <TabsTrigger value="content-types" className="gap-2 rounded-lg text-xs font-semibold">
                <Settings2 className="w-4 h-4" /> Content Types
              </TabsTrigger>
              <TabsTrigger value="learning-paths" className="gap-2 rounded-lg text-xs font-semibold">
                <Route className="w-4 h-4" /> Learning Paths
              </TabsTrigger>
              <TabsTrigger value="interview-paths" className="gap-2 rounded-lg text-xs font-semibold">
                <Target className="w-4 h-4" /> Interview Paths
              </TabsTrigger>
              <TabsTrigger value="reviewer-groups" className="gap-2 rounded-lg text-xs font-semibold">
                <Users className="w-4 h-4" /> Reviewer Groups
              </TabsTrigger>
              <TabsTrigger value="error-logs" className="gap-2 rounded-lg text-xs font-semibold text-destructive">
                <ShieldAlert className="w-4 h-4" /> Error Audit Logs
              </TabsTrigger>
            </TabsList>
          )}

          {/* Render Tab Contents */}
          <TabsContent value="categories" className="mt-0 focus-visible:outline-none">
            <CategoriesTab />
          </TabsContent>

          <TabsContent value="tags" className="mt-0 focus-visible:outline-none">
            <TagsTab />
          </TabsContent>

          <TabsContent value="content-types" className="mt-0 focus-visible:outline-none">
            <ContentTypesTab />
          </TabsContent>

          <TabsContent value="learning-paths" className="mt-0 focus-visible:outline-none">
            <LearningPathsTab />
          </TabsContent>

          <TabsContent value="interview-paths" className="mt-0 focus-visible:outline-none">
            <InterviewPathsTab />
          </TabsContent>

          <TabsContent value="reviewer-groups" className="mt-0 focus-visible:outline-none">
            <ReviewerGroupsTab />
          </TabsContent>

          <TabsContent value="error-logs" className="mt-0 focus-visible:outline-none">
            <ErrorAuditLogsTab />
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}

