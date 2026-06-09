import { Link, useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { BookOpen, Loader2, LayoutList } from 'lucide-react';
import { CmsResponseDto } from '@/api/types';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useEnroll, useMyEnrollment } from '@/api/hooks/useEnrollments';
import { useSectionsByCourse } from '@/api/hooks/useSections';
import { toast } from 'sonner';
import { buildCourseUrl } from '@/lib/slug';

interface ExploreContentCardProps {
  item: CmsResponseDto;
  className?: string;
}

// ─── Heading extraction (fallback when no sections exist) ─────────────────────

function extractHeadings(body: string | null | undefined): string[] {
  if (!body?.trim() || !body.trim().startsWith('[')) return [];
  try {
    const blocks: Array<{ type: string; content?: string }> = JSON.parse(body.trim());
    if (!Array.isArray(blocks)) return [];
    return blocks
      .filter(b => b.type === 'heading1' || b.type === 'heading2' || b.type === 'heading3')
      .map(b => b.content?.trim() ?? '')
      .filter(Boolean);
  } catch {
    return [];
  }
}

// ─── ExploreContentCard ───────────────────────────────────────────────────────

export function ExploreContentCard({ item, className }: ExploreContentCardProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();
  const enroll = useEnroll();
  const { data: enrollment } = useMyEnrollment(item.id, isAuthenticated);

  // Fetch sections (chapters) for this course — public endpoint, no auth needed
  const { data: sections = [] } = useSectionsByCourse(item.id, true);

  const blockCount = item.blockCount ?? 0;

  // Prefer real section titles; fall back to body headings
  const curriculumItems: string[] =
    sections.length > 0
      ? sections.map(s => s.title).filter(Boolean)
      : extractHeadings(item.body);

  const handleEnroll = async (e: React.MouseEvent) => {
    e.preventDefault();
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }
    try {
      await enroll.mutateAsync(item.id);
      toast.success('Enrolled successfully');
    } catch {
      toast.error('Failed to enroll');
    }
  };

  return (
    <Link to={buildCourseUrl(item)}>
      <Card
        className={cn(
          'group overflow-hidden hover:shadow-md transition-all duration-200',
          'border-border/50 hover:border-primary/30 h-full',
          className,
        )}
      >
        <div className="flex h-full">
          {/* Thumbnail — fixed narrow column */}
          <div className="relative w-20 flex-shrink-0 bg-gradient-to-br from-primary/10 to-primary/5 min-h-[100px]">
            {item.thumbnailUrl ? (
              <img
                src={item.thumbnailUrl}
                alt={item.title || 'Course'}
                className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            ) : (
              <div className="flex items-center justify-center h-full">
                <BookOpen className="w-6 h-6 text-primary/25" />
              </div>
            )}
          </div>

          {/* Content */}
          <CardContent className="flex-1 min-w-0 py-2.5 px-3 flex flex-col gap-1.5">
            {/* Row 1: category + enroll */}
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                {item.categoryName && (
                  <span className="text-[10px] font-medium text-primary/70 uppercase tracking-wide block truncate">
                    {item.categoryName}
                  </span>
                )}
                <h3 className="text-sm font-semibold text-foreground leading-snug line-clamp-1 group-hover:text-primary transition-colors">
                  {item.title || 'Untitled'}
                </h3>
              </div>
              <Button
                size="sm"
                variant={enrollment ? 'outline' : 'default'}
                className="h-6 text-[11px] px-2 py-0 flex-shrink-0 mt-0.5"
                onClick={handleEnroll}
                disabled={enroll.isPending || !!enrollment}
              >
                {enroll.isPending && <Loader2 className="w-2.5 h-2.5 mr-1 animate-spin" />}
                {enrollment ? 'Enrolled' : 'Enroll'}
              </Button>
            </div>

            {/* Row 2: curriculum chapters or description */}
            {curriculumItems.length > 0 ? (
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 mb-0.5">
                  <LayoutList className="w-3 h-3" />
                  <span>Curriculum</span>
                </div>
                {curriculumItems.slice(0, 4).map((title, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-1 text-[11px] text-muted-foreground leading-snug"
                  >
                    <span className="mt-0.5 w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center rounded-full bg-primary/10 text-primary text-[9px] font-bold">
                      {i + 1}
                    </span>
                    <span className="line-clamp-1">{title}</span>
                  </div>
                ))}
                {curriculumItems.length > 4 && (
                  <span className="text-[10px] text-muted-foreground/50 pl-4.5">
                    +{curriculumItems.length - 4} more chapters
                  </span>
                )}
              </div>
            ) : item.description ? (
              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-snug">
                {item.description}
              </p>
            ) : null}

            {/* Row 3: meta footer */}
            <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-auto pt-0.5">
              {sections.length > 0 ? (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-normal">
                  {sections.length} {sections.length === 1 ? 'chapter' : 'chapters'}
                </Badge>
              ) : blockCount > 0 ? (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 py-0 font-normal">
                  {blockCount} lessons
                </Badge>
              ) : null}
              <span className="ml-auto">
                {item.publishedAt
                  ? new Date(item.publishedAt).toLocaleDateString()
                  : new Date(item.createdAt).toLocaleDateString()}
              </span>
            </div>
          </CardContent>
        </div>
      </Card>
    </Link>
  );
}
