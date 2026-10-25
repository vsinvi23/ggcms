import { usePageMeta } from '@/hooks/usePageMeta';
import { useMemo, useState } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, ArrowRight } from 'lucide-react';
import { useCategories } from '@/api/hooks/useCategories';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useNavigate } from 'react-router-dom';

interface TechnologyEcosystem {
  id: number;
  slug: string;
  name: string;
  category: string;
  description: string;
  coursesCount: number;
  articlesCount: number;
  popularTopics: string[];
}

export function TechnologiesPage() {
  usePageMeta({ title: 'Technologies', description: 'Browse technologies and the articles and courses for each.', canonicalPath: '/technologies' });
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const { data: categories = [], isLoading: loadingCategories, isError } = useCategories();
  const { data: cmsData, isLoading: loadingCms } = usePublicCmsList({ size: 200 });

  const technologies = useMemo((): TechnologyEcosystem[] => {
    const items = cmsData?.items ?? [];
    const countFor = (name: string) => {
      const matches = items.filter(i => i.categoryName === name);
      const articles = matches.filter(i => i.type === 'ARTICLE' || !!i.articleType).length;
      return { articles, courses: matches.length - articles };
    };
    return categories
      .filter(c => !c.isVirtual && !c.parentId)
      .flatMap(root => (root.children?.length ? root.children.map(child => ({ child, root })) : [{ child: root, root }]))
      .map(({ child, root }) => {
        const counts = countFor(child.name);
        return {
          id: child.id,
          slug: child.slug || String(child.id),
          name: child.name,
          category: root.name,
          description: child.description || '',
          coursesCount: counts.courses,
          articlesCount: counts.articles,
          popularTopics: (child.children ?? []).map(g => g.name).slice(0, 6),
        };
      });
  }, [categories, cmsData]);

  const filtered = technologies.filter(t =>
    t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
    t.popularTopics.some(top => top.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const isLoading = loadingCategories || loadingCms;

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-16">
        
        <div className="relative border-b border-border bg-gradient-to-b from-primary/5 via-transparent to-background pt-12 pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            <Badge variant="outline" className="px-3 py-1 text-xs font-semibold text-primary border-primary/30 rounded-full">
              Technology Ecosystem Directory
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Technologies
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Explore our articles and courses by technology.
            </p>

            <div className="max-w-xl mx-auto relative pt-4">
              <div className="relative">
                <Search className="absolute left-4 top-3.5 h-5 w-5 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search technologies..."
                  aria-label="Search technologies"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-12 pr-4 h-12 text-base rounded-2xl bg-card border-border shadow-sm focus-visible:ring-2 focus-visible:ring-primary"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
          <div aria-live="polite">
            {isLoading ? (
              <p role="status" className="text-center text-sm text-muted-foreground py-12">Loading technologies...</p>
            ) : isError ? (
              <p role="alert" className="text-center text-sm text-destructive py-12">Could not load technologies. Please try again later.</p>
            ) : filtered.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No technologies found.</p>
            ) : null}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {filtered.map(tech => (
              <div
                key={tech.id}
                role="link"
                tabIndex={0}
                onClick={() => navigate(`/technology/${tech.slug}`)}
                onKeyDown={(e) => { if (e.key === 'Enter') navigate(`/technology/${tech.slug}`); }}
                className="bg-card border border-border hover:border-primary/50 rounded-3xl p-6 sm:p-8 flex flex-col justify-between transition-all hover:shadow-lg cursor-pointer group"
              >
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Badge variant="secondary" className="text-xs font-bold">{tech.category}</Badge>
                  </div>

                  <div>
                    <h3 className="text-2xl font-extrabold text-foreground group-hover:text-primary transition-colors">
                      {tech.name}
                    </h3>
                    {tech.description && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">
                        {tech.description}
                      </p>
                    )}
                  </div>

                  {/* Resource Counts Grid */}
                  <div className="grid grid-cols-2 gap-2 pt-2 border-y border-border/60 py-3 text-center">
                    <div>
                      <span className="text-lg font-extrabold text-primary block">{tech.coursesCount}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Courses</span>
                    </div>
                    <div>
                      <span className="text-lg font-extrabold text-foreground block">{tech.articlesCount}</span>
                      <span className="text-[10px] text-muted-foreground font-bold uppercase">Articles</span>
                    </div>
                  </div>

                  {tech.popularTopics.length > 0 && (
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Popular Topics:</span>
                    <div className="flex flex-wrap gap-1">
                      {tech.popularTopics.map(top => (
                        <span key={top} className="text-[10px] font-semibold bg-muted px-2 py-0.5 rounded-md text-foreground">
                          {top}
                        </span>
                      ))}
                    </div>
                  </div>
                  )}
                </div>

                <div className="pt-4 mt-4 flex items-center justify-between text-xs font-bold text-primary">
                  <span>Explore {tech.name} Ecosystem</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default TechnologiesPage;
