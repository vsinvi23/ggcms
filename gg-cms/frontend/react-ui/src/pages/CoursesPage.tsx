import React, { useState, useMemo } from 'react';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Search, BookOpen, Clock, Layers, Filter, CheckCircle2, ChevronRight, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { useNavigate } from 'react-router-dom';
import { useCategories } from '@/api/hooks/useCategories';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useContentTypes } from '@/api/hooks/useContentTypes';
import { buildCourseUrl } from '@/lib/slug';

interface CourseCardData {
  id: string;
  slug: string;
  title: string;
  description: string;
  level: string;
  modulesCount: number;
  lessonsCount: number;
  durationText: string;
  category: string;
  technology: string;
  learningStyle: string;
  skills: string[];
  progress?: number;
}

export function CoursesPage() {
  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedLevel, setSelectedLevel] = useState<string>('All');
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedStyle, setSelectedStyle] = useState<string>('All');

  // Live backend categories API hook
  const { data: backendCategories } = useCategories();
  // Live backend published CMS courses API hook
  const { data: publicCmsData, isLoading: loadingCms } = usePublicCmsList({ type: 'COURSE', size: 50 });
  // Live backend levels & learning styles API hooks
  const { data: backendLevels } = useContentTypes('level');
  const { data: backendStyles } = useContentTypes('learning_style');

  const backendCourses = useMemo(() => {
    if (!publicCmsData?.items || publicCmsData.items.length === 0) return [];
    return publicCmsData.items.map(item => {
      const dur = item.durationMinutes && item.durationMinutes > 0
        ? (Math.floor(item.durationMinutes / 60) > 0 ? `${Math.floor(item.durationMinutes / 60)}h ${item.durationMinutes % 60}m` : `${item.durationMinutes}m`)
        : (item.blockCount && item.blockCount > 0 ? `${item.blockCount * 5}m` : 'Self-paced');
      return {
        id: String(item.id),
        slug: item.slug || buildCourseUrl(item),
        title: item.title,
        description: item.description || '',
        level: (item.level as any) || 'Intermediate',
        modulesCount: item.sectionsCount ?? 0,
        lessonsCount: item.lessonsCount ?? 0,
        durationText: dur,
        category: item.categoryName || 'Engineering',
        technology: item.tags?.[0] || 'Go',
        learningStyle: 'Hands-on',
        skills: item.tags || ['Go', 'REST', 'Backend'],
        progress: 0,
      };
    });
  }, [publicCmsData]);

  const allCourses = useMemo(() => {
    return backendCourses;
  }, [backendCourses]);

  const categories = useMemo(() => {
    const flattenNames = (cats: any[]): string[] =>
      cats.flatMap(c => [c.name, ...flattenNames(c.children ?? [])]);
    const fetchedNames = flattenNames(backendCategories ?? []).filter(Boolean);
    if (fetchedNames.length > 0) {
      return ['All', ...Array.from(new Set(fetchedNames))];
    }
    return ['All', 'Technology', 'Cloud', 'Security', 'Engineering'];
  }, [backendCategories]);

  const levels = useMemo(() => {
    const fetched = (backendLevels ?? []).map(l => l.label).filter(Boolean);
    if (fetched.length > 0) {
      return ['All', ...Array.from(new Set(fetched))];
    }
    return ['All', 'Beginner', 'Intermediate', 'Advanced'];
  }, [backendLevels]);

  const styles = useMemo(() => {
    const fetched = (backendStyles ?? []).map(s => s.label).filter(Boolean);
    if (fetched.length > 0) {
      return ['All', ...Array.from(new Set(fetched))];
    }
    return ['All', 'Theory', 'Hands-on', 'Project based'];
  }, [backendStyles]);

  const filteredCourses = useMemo(() => {
    return allCourses.filter(course => {
      const matchesSearch = searchQuery === '' || 
        course.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        course.skills.some(s => s.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesLevel = selectedLevel === 'All' || course.level === selectedLevel;
      let matchesCategory = selectedCategory === 'All' || course.category.toLowerCase().includes(selectedCategory.toLowerCase());
      if (!matchesCategory && selectedCategory.toLowerCase().includes('software')) {
        matchesCategory = course.category.toLowerCase().includes('backend') || course.category.toLowerCase().includes('design') || course.category.toLowerCase().includes('programming');
      }
      const matchesStyle = selectedStyle === 'All' || course.learningStyle === selectedStyle;

      return matchesSearch && matchesLevel && matchesCategory && matchesStyle;
    });
  }, [searchQuery, selectedLevel, selectedCategory, selectedStyle, allCourses]);

  const hasActiveFilters = selectedLevel !== 'All' || selectedCategory !== 'All' || selectedStyle !== 'All' || searchQuery !== '';

  const resetFilters = () => {
    setSelectedLevel('All');
    setSelectedCategory('All');
    setSelectedStyle('All');
    setSearchQuery('');
  };

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-12">
        
        {/* Clean Sub-Header Bar — Title Left, Centered Search Bar */}
        <div className="border-b border-border bg-card/40 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0 sm:w-1/4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight">
                  Courses
                </h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Systematic learning paths</p>
              </div>
            </div>

            {/* Centered Search Bar */}
            <div className="relative w-full max-w-md sm:w-1/2 flex justify-center">
              <div className="relative w-full">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="text"
                  placeholder="Search courses or skills..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs rounded-xl bg-background border-border shadow-2xs w-full"
                />
                {searchQuery && (
                  <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Right Spacer */}
            <div className="hidden sm:block sm:w-1/4"></div>
          </div>
        </div>

        {/* 2-Column Space-Optimized Grid */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
            
            {/* Left-Aligned Compact Filter Panel (Single-Page View Fit) */}
            <div className="md:col-span-1 space-y-3 bg-card border border-border rounded-2xl p-3.5 h-fit shadow-2xs">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                  <Filter className="w-3 h-3 text-primary" />
                  Filters
                </span>
                {hasActiveFilters && (
                  <button onClick={resetFilters} className="text-[11px] text-primary hover:underline font-semibold">
                    Reset
                  </button>
                )}
              </div>

              {/* Category Filter */}
              <div className="space-y-1">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Category</label>
                <div className="flex flex-wrap gap-1">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedCategory === cat
                          ? 'bg-primary text-primary-foreground shadow-2xs'
                          : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Level Filter */}
              <div className="space-y-1 pt-1.5 border-t border-border/50">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Level</label>
                <div className="flex flex-wrap gap-1">
                  {levels.map(lvl => (
                    <button
                      key={lvl}
                      onClick={() => setSelectedLevel(lvl)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedLevel === lvl
                          ? 'bg-primary/10 text-primary font-bold border border-primary/30'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {lvl}
                    </button>
                  ))}
                </div>
              </div>

              {/* Learning Style Filter */}
              <div className="space-y-1 pt-1.5 border-t border-border/50">
                <label className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Learning Style</label>
                <div className="flex flex-wrap gap-1">
                  {styles.map(st => (
                    <button
                      key={st}
                      onClick={() => setSelectedStyle(st)}
                      className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedStyle === st
                          ? 'bg-primary/10 text-primary font-bold border border-primary/30'
                          : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {st}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Column — Content Cards Grid immediately visible */}
            <div className="md:col-span-3 space-y-4">
              {loadingCms ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <div key={i} className="bg-card border border-border rounded-2xl p-4 space-y-3 animate-pulse">
                      <div className="flex justify-between items-center">
                        <Skeleton className="h-4 w-20 rounded" />
                        <Skeleton className="h-4 w-16 rounded" />
                      </div>
                      <Skeleton className="h-5 w-3/4 rounded" />
                      <Skeleton className="h-8 w-full rounded" />
                      <Skeleton className="h-8 w-full rounded-xl" />
                    </div>
                  ))}
                </div>
              ) : filteredCourses.length === 0 ? (
                <div className="text-center py-12 bg-card border border-border rounded-2xl p-6">
                  <BookOpen className="w-10 h-10 mx-auto text-muted-foreground/40 mb-2" />
                  <h3 className="text-base font-bold mb-1">No courses match your criteria</h3>
                  <p className="text-xs text-muted-foreground mb-3">Try adjusting your filters or keyword.</p>
                  <Button variant="outline" size="sm" onClick={resetFilters}>Reset All Filters</Button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredCourses.map(course => (
                    <div
                      key={course.id}
                      className="bg-card border border-border hover:border-primary/50 rounded-2xl p-4 flex flex-col justify-between transition-all hover:shadow-md group space-y-3"
                    >
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Badge variant="secondary" className="text-[10px] font-bold">
                            {course.category}
                          </Badge>
                          <span className="text-[10px] font-semibold text-muted-foreground bg-muted px-2 py-0.5 rounded">
                            {course.level}
                          </span>
                        </div>

                        <h3 className="text-sm font-extrabold text-foreground group-hover:text-primary transition-colors line-clamp-1">
                          {course.title}
                        </h3>

                        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed">
                          {course.description}
                        </p>

                        <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-medium pt-0.5">
                          <span className="flex items-center gap-1">
                            <Layers className="w-3.5 h-3.5 text-primary" />
                            {course.modulesCount} mod &bull; {course.lessonsCount} lessons
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3.5 h-3.5 text-primary" />
                            {course.durationText}
                          </span>
                        </div>
                      </div>

                      <div className="pt-2.5 border-t border-border/60 mt-2 space-y-2">
                        {typeof course.progress === 'number' && course.progress > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-[10px] font-bold">
                              <span className="text-muted-foreground">Progress</span>
                              <span className="text-primary">{course.progress}%</span>
                            </div>
                            <Progress value={course.progress} className="h-1" />
                          </div>
                        )}

                        <Button
                          onClick={() => navigate(`/course/${course.slug}`)}
                          className={`w-full justify-between font-bold rounded-xl text-xs h-8.5 ${
                            course.progress && course.progress > 0
                              ? 'bg-primary text-primary-foreground'
                              : 'bg-primary text-primary-foreground hover:bg-primary/90'
                          }`}
                        >
                          <span>{course.progress && course.progress > 0 ? 'Continue' : 'Start Course'}</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default CoursesPage;
