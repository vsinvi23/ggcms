import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { BookOpen, Code, Clock, Play, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useCategories } from '@/api/hooks/useCategories';
import { useTags } from '@/api/hooks/useTags';
import {
  usePublicArticlesByCategory,
  usePublicCoursesByCategory,
} from '@/api/hooks/usePublicCms';
import { CmsResponseDto } from '@/api/types';
import { FilterBar } from '@/components/public/FilterBar';

const TechnologyPage = () => {
  const { slug } = useParams<{ slug: string }>();

  // TODO: tag filtering — selectedTagIds will filter items once the public API
  // returns tags on each content item. Currently CmsResponseDto has no tags field.
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  const { data: categories, isLoading: catLoading } = useCategories();
  const { data: tags, isLoading: tagsLoading } = useTags();

  const category = slug
    ? (categories ?? []).find((c) => c.slug === slug || c.slug === slug?.toLowerCase())
    : null;

  const { data: articlesData, isLoading: articlesLoading } = usePublicArticlesByCategory(
    slug ?? '',
    { size: 20 }
  );
  const { data: coursesData, isLoading: coursesLoading } = usePublicCoursesByCategory(
    slug ?? '',
    { size: 20 }
  );

  const articles: CmsResponseDto[] = articlesData?.items ?? [];
  const courses: CmsResponseDto[] = coursesData?.items ?? [];
  const isLoading = catLoading || articlesLoading || coursesLoading;

  const handleTagToggle = (id: number) => {
    setSelectedTagIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]
    );
  };

  const hasActiveFilters = selectedTagIds.length > 0;

  if (!catLoading && !category && slug) {
    return (
      <PublicLayout>
        <div className="text-center py-16">
          <h1 className="text-2xl font-bold mb-4">Category not found</h1>
          <Link to="/">
            <Button>Go Home</Button>
          </Link>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="space-y-6">
        {/* Hero */}
        <section className="rounded-xl bg-primary text-primary-foreground p-8">
          {catLoading ? (
            <div className="space-y-3">
              <Skeleton className="h-8 w-64 bg-primary-foreground/20" />
              <Skeleton className="h-4 w-96 bg-primary-foreground/20" />
            </div>
          ) : (
            <>
              <h1 className="text-3xl font-bold mb-3">{category?.name ?? slug}</h1>
              {category?.description && (
                <p className="text-primary-foreground/90 max-w-2xl mb-4">{category.description}</p>
              )}
              <div className="flex items-center gap-3">
                <Badge className="bg-primary-foreground/20 text-primary-foreground border-0">
                  {coursesData?.total ?? courses.length} Courses
                </Badge>
                <Badge className="bg-primary-foreground/20 text-primary-foreground border-0">
                  {articlesData?.total ?? articles.length} Articles
                </Badge>
              </div>
            </>
          )}
        </section>

        {/* Filters — tag row only (this page is already scoped to a single category) */}
        <FilterBar
          tags={tags}
          selectedTagIds={selectedTagIds}
          onTagChange={handleTagToggle}
          tagsLoading={tagsLoading}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={() => setSelectedTagIds([])}
          // Category chips are intentionally omitted on TechnologyPage because
          // the page content is already filtered to a single category slug.
          onCategoryChange={() => undefined}
        />

        {/* Content */}
        <Tabs defaultValue="courses">
          <TabsList className="mb-6">
            <TabsTrigger value="courses">Courses</TabsTrigger>
            <TabsTrigger value="articles">Articles</TabsTrigger>
          </TabsList>

          <TabsContent value="courses">
            {coursesLoading ? (
              <LoadingGrid count={4} />
            ) : courses.length === 0 ? (
              <EmptyState message="No courses in this category yet." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {courses.map((course) => (
                  <Card key={course.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                    <div className="h-20 bg-primary rounded-t-lg flex items-center justify-center">
                      <Play className="h-6 w-6 text-primary-foreground" />
                    </div>
                    <CardContent className="p-4">
                      <h3 className="font-semibold group-hover:text-primary transition-colors mb-2 line-clamp-2">
                        {course.title}
                      </h3>
                      {course.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {course.description}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="articles">
            {articlesLoading ? (
              <LoadingGrid count={3} />
            ) : articles.length === 0 ? (
              <EmptyState message="No articles in this category yet." />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {articles.map((article) => (
                  <Card key={article.id} className="hover:shadow-md transition-shadow cursor-pointer group">
                    <CardContent className="p-5">
                      <FileText className="h-6 w-6 text-primary mb-3" />
                      <h3 className="font-semibold group-hover:text-primary transition-colors mb-2 line-clamp-2">
                        {article.title}
                      </h3>
                      {article.description && (
                        <p className="text-sm text-muted-foreground line-clamp-2">
                          {article.description}
                        </p>
                      )}
                      {article.publishedAt && (
                        <div className="flex items-center gap-1 text-xs text-muted-foreground mt-3">
                          <Clock className="h-3 w-3" />
                          {new Date(article.publishedAt).toLocaleDateString()}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </PublicLayout>
  );
};

function LoadingGrid({ count }: { count: number }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <Card key={i}>
          <Skeleton className="h-20 w-full rounded-t-lg rounded-b-none" />
          <CardContent className="p-4 space-y-2">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="text-center py-12">
      <BookOpen className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
      <p className="text-muted-foreground">{message}</p>
    </div>
  );
}

export default TechnologyPage;
