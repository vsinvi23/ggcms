import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Hash, FileText, BookOpen, ChevronRight } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useTopics, useTopicRelationships, useTopicContent } from '@/api/hooks/useTopics';
import { TopicChip } from '@/components/public/TopicChip';
import { ContentCard } from '@/components/public/ContentCard';
import { Button } from '@/components/ui/button';

const TopicDetailPage = () => {
  const { slug } = useParams<{ slug: string }>();
  const { data: topics = [], isLoading: loadingTopics } = useTopics();
  const topic = useMemo(() => topics.find(t => t.slug === slug), [topics, slug]);

  const { data: relationships = [] } = useTopicRelationships(topic?.id ?? null);
  const { data: content = [], isLoading: loadingContent } = useTopicContent(topic?.id ?? null);

  const prerequisites = relationships.filter(r => r.relationship_type === 'PREREQUISITE_OF' || r.relationship_type === 'BUILDS_ON');
  const related = relationships.filter(r => r.relationship_type !== 'PREREQUISITE_OF' && r.relationship_type !== 'BUILDS_ON');

  const relatedTopicName = (topicId: number) => topics.find(t => t.id === topicId);

  const articles = content.filter(c => c.type === 'ARTICLE');
  const courses = content.filter(c => c.type === 'COURSE');

  if (loadingTopics) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-6 py-10 space-y-6">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-4 w-full max-w-lg" />
          <Skeleton className="h-24 w-full" />
        </div>
      </PublicLayout>
    );
  }

  if (!topic) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto px-6 py-20 text-center">
          <Hash className="mx-auto h-12 w-12 text-muted-foreground/40 mb-4" />
          <h1 className="text-2xl font-bold mb-2">Topic not found</h1>
          <p className="text-muted-foreground mb-6">This topic may have been merged or removed.</p>
          <Link to="/topics"><Button>Browse Topics</Button></Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground">
          <Link to="/topics" className="hover:text-primary transition-colors">Topics</Link>
          <ChevronRight className="w-3.5 h-3.5" />
          <span className="text-foreground">{topic.name}</span>
        </nav>

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-foreground">{topic.name}</h1>
          {topic.description && (
            <p className="text-muted-foreground mt-2 max-w-2xl">{topic.description}</p>
          )}
          <div className="flex items-center gap-6 mt-4 text-sm text-muted-foreground">
            <span className="flex items-center gap-1.5"><FileText className="h-4 w-4" /> {articles.length} Articles</span>
            <span className="flex items-center gap-1.5"><BookOpen className="h-4 w-4" /> {courses.length} Courses</span>
          </div>
        </div>

        <Tabs defaultValue="overview">
          <TabsList>
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="articles">Articles</TabsTrigger>
            <TabsTrigger value="courses">Courses</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-8 pt-6">
            {prerequisites.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Prerequisites</h2>
                <div className="flex flex-wrap gap-2">
                  {prerequisites.map(r => {
                    const t = relatedTopicName(r.target_topic_id);
                    return t ? <TopicChip key={r.id ?? r.target_topic_id} name={t.name} slug={t.slug} /> : null;
                  })}
                </div>
              </section>
            )}

            {related.length > 0 && (
              <section>
                <h2 className="text-lg font-semibold mb-3">Related Topics</h2>
                <div className="flex flex-wrap gap-2">
                  {related.map(r => {
                    const t = relatedTopicName(r.target_topic_id);
                    return t ? <TopicChip key={r.id ?? r.target_topic_id} name={t.name} slug={t.slug} /> : null;
                  })}
                </div>
              </section>
            )}

            <section>
              <h2 className="text-lg font-semibold mb-3">Popular Content</h2>
              {loadingContent ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
                </div>
              ) : content.length === 0 ? (
                <p className="text-sm text-muted-foreground">No content tagged with this topic yet.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {content.slice(0, 6).map(item => <ContentCard key={`${item.type}-${item.id}`} item={item} />)}
                </div>
              )}
            </section>
          </TabsContent>

          <TabsContent value="articles" className="pt-6">
            {articles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No articles tagged with this topic yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {articles.map(item => <ContentCard key={item.id} item={item} />)}
              </div>
            )}
          </TabsContent>

          <TabsContent value="courses" className="pt-6">
            {courses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No courses tagged with this topic yet.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {courses.map(item => <ContentCard key={item.id} item={item} />)}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PublicLayout>
  );
};

export default TopicDetailPage;
