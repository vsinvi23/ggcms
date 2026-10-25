import { useMemo, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { AuthModal } from '@/components/auth/AuthModal';
import { AssessmentTaker } from '@/components/assessment/AssessmentTaker';
import { Search, Target, Clock, ArrowRight, HelpCircle, Filter, X, ArrowLeft } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useCategories } from '@/api/hooks/useCategories';
import { useAuth } from '@/contexts/AuthContext';
import { CmsResponseDto } from '@/api/types';

interface AssessmentItem {
  id: number;
  slug: string;
  title: string;
  description: string;
  category: string;
  questionCount: number;
  minutes: number | null;
}

const countQuestions = (metadata: string | null | undefined): number => {
  if (!metadata) return 0;
  try {
    const parsed = JSON.parse(metadata) as { questions?: unknown[] };
    return Array.isArray(parsed.questions) ? parsed.questions.length : 0;
  } catch {
    return 0;
  }
};

const toAssessment = (item: CmsResponseDto): AssessmentItem => ({
  id: item.id,
  slug: item.slug || String(item.id),
  title: item.title,
  description: item.description || '',
  category: item.categoryName || 'General',
  questionCount: countQuestions(item.interactiveMetadata),
  minutes: item.durationMinutes ?? null,
});

export function PracticeHub() {
  const navigate = useNavigate();
  const { quizId } = useParams<{ quizId?: string }>();
  const { isAuthenticated } = useAuth();

  const { data: publicCourses, isLoading, isError, refetch } = usePublicCmsList({ size: 100, type: 'COURSE', courseType: 'ASSESSMENT' });
  const { data: backendCategories } = useCategories();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [authOpen, setAuthOpen] = useState(false);

  const assessments = useMemo(
    () => (publicCourses?.items ?? []).filter(i => i.courseType === 'ASSESSMENT').map(toAssessment),
    [publicCourses],
  );

  const categories = useMemo(() => {
    const fetched = (backendCategories ?? []).map(c => c.name).filter(Boolean);
    return ['All', ...Array.from(new Set(fetched))];
  }, [backendCategories]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return assessments.filter(a => {
      if (selectedCategory !== 'All' && a.category !== selectedCategory) return false;
      return !q || a.title.toLowerCase().includes(q) || a.description.toLowerCase().includes(q);
    });
  }, [assessments, searchQuery, selectedCategory]);

  const active = quizId ? assessments.find(a => a.slug === quizId || String(a.id) === quizId) ?? null : null;

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-12">
        <div className="border-b border-border bg-card/40 px-4 sm:px-6 lg:px-8 py-3.5">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-3 shrink-0 sm:w-1/4">
              <div className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Target className="w-5 h-5" aria-hidden="true" />
              </div>
              <div>
                <h1 className="text-lg font-extrabold tracking-tight">Practice</h1>
                <p className="text-[11px] text-muted-foreground hidden lg:block">Quizzes &amp; tests</p>
              </div>
            </div>

            {!active && (
              <div className="relative w-full max-w-md sm:w-1/2">
                <Search className="absolute left-3.5 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <Input
                  type="text"
                  aria-label="Search practice tests"
                  placeholder="Search practice tests..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-8 h-9 text-xs rounded-xl bg-background border-border shadow-2xs w-full"
                />
                {searchQuery && (
                  <button type="button" aria-label="Clear search" onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2.5 text-muted-foreground hover:text-foreground">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            )}
            <div className="sm:w-1/4" />
          </div>
        </div>

        {quizId && !active && !isLoading ? (
          <div role="status" className="max-w-3xl mx-auto px-4 pt-10 text-center space-y-3">
            <p className="text-sm text-muted-foreground">This practice test could not be found.</p>
            <Button variant="outline" size="sm" onClick={() => navigate('/practice')}>Browse practice tests</Button>
          </div>
        ) : active ? (
          <div className="max-w-3xl mx-auto px-3 sm:px-4 pt-5 space-y-4">
            <Button variant="ghost" size="sm" onClick={() => navigate('/practice')} className="rounded-xl gap-1 text-xs">
              <ArrowLeft className="w-3.5 h-3.5" /> All practice tests
            </Button>
            {isAuthenticated ? (
              <AssessmentTaker assessmentId={active.id} title={active.title} description={active.description} />
            ) : (
              <div className="bg-card border border-border rounded-2xl p-8 text-center space-y-3">
                <h2 className="text-lg font-extrabold">{active.title}</h2>
                <p className="text-xs text-muted-foreground">Sign in to take this test and keep your scores.</p>
                <Button onClick={() => setAuthOpen(true)} className="rounded-xl text-xs font-bold">Sign in to start</Button>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full max-w-[1800px] mx-auto px-3 sm:px-4 lg:px-5 pt-5">
            <div className="grid grid-cols-1 md:grid-cols-[250px_minmax(0,1fr)] gap-5">
              <div className="space-y-3 bg-card border border-border rounded-2xl p-3.5 h-fit shadow-2xs md:sticky md:top-16">
                <div className="flex items-center justify-between border-b border-border pb-2">
                  <span className="font-bold text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                    <Filter className="w-3 h-3 text-primary" aria-hidden="true" /> Category
                  </span>
                  {selectedCategory !== 'All' && (
                    <button type="button" onClick={() => setSelectedCategory('All')} className="text-[11px] text-primary hover:underline font-semibold">Reset</button>
                  )}
                </div>
                <div className="flex flex-wrap gap-1">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      aria-pressed={selectedCategory === cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-all ${
                        selectedCategory === cat ? 'bg-primary text-primary-foreground' : 'bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-w-0 space-y-4">
                {isError ? (
                  <div role="alert" className="py-16 text-center text-sm text-muted-foreground space-y-3">
                    <p>Could not load practice tests.</p>
                    <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
                  </div>
                ) : filtered.length === 0 ? (
                  <div role="status" aria-live="polite" className="py-16 text-center text-sm text-muted-foreground">
                    {isLoading
                      ? 'Loading practice tests...'
                      : assessments.length === 0
                        ? 'No practice tests are published yet. Check back soon.'
                        : 'No practice tests match your filters.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-5">
                    {filtered.map(a => (
                      <div key={a.id} className="bg-card border border-border hover:border-primary/50 rounded-2xl p-5 flex flex-col justify-between transition-all hover:shadow-md">
                        <div className="space-y-3">
                          <Badge variant="secondary" className="text-[10px] font-bold">{a.category.toUpperCase()}</Badge>
                          <h3 className="text-base font-extrabold text-foreground">{a.title}</h3>
                          {a.description && <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">{a.description}</p>}
                          <div className="flex items-center gap-3 text-[11px] text-muted-foreground font-medium pt-1">
                            {a.questionCount > 0 && (
                              <span className="flex items-center gap-1"><HelpCircle className="w-3.5 h-3.5 text-primary" aria-hidden="true" />{a.questionCount} questions</span>
                            )}
                            {a.minutes && (
                              <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-primary" aria-hidden="true" />{a.minutes} mins</span>
                            )}
                          </div>
                        </div>
                        <div className="pt-4 border-t border-border/60 mt-4">
                          <Button onClick={() => navigate(`/practice/${a.slug}`)} className="w-full justify-between font-bold rounded-xl text-xs h-9">
                            <span>Open test</span>
                            <ArrowRight className="w-4 h-4" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
      <AuthModal open={authOpen} onOpenChange={setAuthOpen} redirectToDashboard={false} />
    </PublicLayout>
  );
}

export default PracticeHub;
