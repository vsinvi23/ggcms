import { Link, useNavigate } from 'react-router-dom';
import { Play, BookOpen, CheckCircle2, GraduationCap, Lock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CmsResponseDto, EnrollmentDto } from '@/api/types';
import { buildCourseUrl } from '@/lib/slug';
import { useAuth } from '@/contexts/AuthContext';

interface PublicCourseCardProps {
  course: CmsResponseDto;
  enrollment?: EnrollmentDto | null;
  className?: string;
}

const TYPE_COLOR: Record<string, string> = {
  BYTE:          'bg-amber-500',
  STANDARD:      'bg-violet-600',
  LEARNING_PLAN: 'bg-blue-600',
  CAPSULE:       'bg-rose-500',
};

export function PublicCourseCard({ course, enrollment, className }: PublicCourseCardProps) {
  const navigate = useNavigate();
  const { isAuthenticated } = useAuth();

  const isEnrolled  = !!enrollment;
  const progress    = isEnrolled ? Math.round((enrollment!.progress ?? 0) * 100) : 0;
  const lessonCount = course.blockCount ?? 0;
  const courseUrl   = buildCourseUrl(course);
  const detailUrl   = courseUrl;
  const learnUrl    = `${courseUrl}?learn=true`;
  const typeBg      = TYPE_COLOR[course.courseType ?? ''] ?? 'bg-violet-600';

  const handleCta = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthenticated) {
      navigate('/auth');
      return;
    }
    if (isEnrolled) {
      navigate(learnUrl);
    } else {
      navigate(detailUrl);
    }
  };

  return (
    <Link to={detailUrl} className={cn('group block', className)}>
      <div className="rounded-2xl overflow-hidden border border-border bg-card hover:shadow-lg hover:border-primary/30 transition-all duration-200 h-full flex flex-col">

        {/* ── Header: gradient / thumbnail ────────────────────────────── */}
        <div className="relative h-36 flex-shrink-0 overflow-hidden">
          {course.thumbnailUrl ? (
            <img
              src={course.thumbnailUrl}
              alt={course.title ?? ''}
              className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            />
          ) : (
            <div
              className="absolute inset-0"
              style={{
                background: 'linear-gradient(135deg, hsl(270 70% 18%) 0%, hsl(270 60% 38%) 60%, hsl(250 65% 32%) 100%)',
              }}
            />
          )}

          {/* Dark overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/20 to-transparent" />

          {/* Top badges */}
          <div className="absolute top-3 left-3 flex items-center gap-1.5 flex-wrap">
            {course.courseType && (
              <span className={cn('text-[10px] font-bold px-2 py-0.5 rounded-full text-white', typeBg)}>
                {course.courseType}
              </span>
            )}
            {course.categoryName && (
              <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'rgba(0,0,0,0.45)', color: 'rgba(255,255,255,0.85)' }}>
                {course.categoryName}
              </span>
            )}
          </div>

          {/* Course title over the image */}
          <div className="absolute bottom-3 left-3 right-12">
            <p className="text-white text-sm font-bold leading-snug line-clamp-2 drop-shadow-sm">
              {course.title ?? 'Untitled Course'}
            </p>
          </div>

          {/* CTA play/resume/enroll button */}
          <button
            onClick={handleCta}
            title={isEnrolled ? 'Resume Learning' : 'View Course'}
            className={cn(
              'absolute bottom-2.5 right-3 w-9 h-9 rounded-full flex items-center justify-center shadow-lg transition-transform hover:scale-110 active:scale-95',
              isEnrolled
                ? 'bg-success text-white'
                : isAuthenticated
                ? 'bg-white text-foreground'
                : 'bg-white/80 text-muted-foreground',
            )}
          >
            {isEnrolled ? (
              <Play size={14} fill="white" className="ml-0.5" />
            ) : isAuthenticated ? (
              <BookOpen size={14} />
            ) : (
              <Lock size={13} />
            )}
          </button>
        </div>

        {/* ── Footer: stats ───────────────────────────────────────────── */}
        <div className="px-4 py-3 flex items-center gap-4 border-t border-border bg-muted/20">

          {/* Lessons count */}
          {lessonCount > 0 && (
            <div className="flex flex-col items-center min-w-0">
              <span className="text-sm font-bold text-primary leading-none">{lessonCount}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">Lessons</span>
            </div>
          )}

          {/* Divider */}
          {lessonCount > 0 && <div className="w-px h-6 bg-border flex-shrink-0" />}

          {/* Progress */}
          <div className="flex flex-col items-center min-w-0">
            <span className={cn(
              'text-sm font-bold leading-none',
              progress === 100 ? 'text-success' : isEnrolled ? 'text-primary' : 'text-muted-foreground',
            )}>
              {isEnrolled ? `${progress}%` : '—'}
            </span>
            <span className="text-[10px] text-muted-foreground mt-0.5">Progress</span>
          </div>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Action chip */}
          <button
            onClick={handleCta}
            className={cn(
              'text-xs font-semibold px-3 py-1.5 rounded-full transition-colors flex-shrink-0',
              isEnrolled && progress === 100
                ? 'bg-success/15 text-success hover:bg-success/25'
                : isEnrolled
                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                : isAuthenticated
                ? 'bg-muted text-foreground hover:bg-muted/80'
                : 'bg-muted text-muted-foreground hover:bg-muted/80',
            )}
          >
            {isEnrolled && progress === 100
              ? 'Completed'
              : isEnrolled
              ? 'Resume'
              : isAuthenticated
              ? 'Enroll'
              : 'View'}
          </button>
        </div>
      </div>
    </Link>
  );
}
