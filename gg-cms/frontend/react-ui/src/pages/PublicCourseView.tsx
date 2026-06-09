import { useRef } from 'react';
import { sanitizeHtml } from '@/lib/sanitize';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { usePublicCmsById, usePublicCmsBody } from '@/api/hooks/usePublicCms';
import { parseBodyToHtml } from '@/lib/htmlParser';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Clock,
  Calendar,
  User,
  Share2,
  Bookmark,
  ArrowLeft,
  ChevronRight,
  Play,
  BookOpen,
  Award,
  Users,
  Star,
  CheckCircle2,
  GraduationCap
} from 'lucide-react';
import { InteractionBar } from '@/components/engagement/InteractionBar';
import { HighlightOverlay } from '@/components/engagement/HighlightOverlay';
import { CommentsSection } from '@/components/shared/CommentsSection';

function CourseSkeleton() {
  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-12 w-3/4" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="aspect-video w-full rounded-xl" />
        </div>
        <div>
          <Skeleton className="h-[400px] w-full rounded-xl" />
        </div>
      </div>
    </div>
  );
}

export default function PublicCourseView() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === 'true';
  const courseId = parseInt(id || '0', 10);
  const discussRef = useRef<HTMLDivElement>(null);

  const { data: course, isLoading: loadingCourse, error } = usePublicCmsById(courseId, true, isPreview, 'COURSE');
  const { data: bodyHtml, isLoading: loadingBody } = usePublicCmsBody(courseId, !!course, isPreview, 'COURSE');

  if (loadingCourse) {
    return (
      <PublicLayout>
        <CourseSkeleton />
      </PublicLayout>
    );
  }

  if (error || !course) {
    return (
      <PublicLayout>
        <div className="max-w-4xl mx-auto text-center py-20">
          <GraduationCap className="h-16 w-16 mx-auto text-muted-foreground/30 mb-6" />
          <h1 className="text-2xl font-bold text-foreground mb-2">Course Not Found</h1>
          <p className="text-muted-foreground mb-6">
            This course doesn't exist or hasn't been published yet.
          </p>
          <Button asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </PublicLayout>
    );
  }

  const thumbnailUrl = course.thumbnailUrl || '';
  const publishDate = course.publishedAt 
    ? new Date(course.publishedAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      })
    : new Date(course.createdAt).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-muted-foreground mb-6">
          <Link to="/" className="hover:text-primary transition-colors">Home</Link>
          <ChevronRight className="w-4 h-4" />
          <Link to="/explore/courses" className="hover:text-primary transition-colors">Courses</Link>
          <ChevronRight className="w-4 h-4" />
          <span className="text-foreground truncate max-w-[200px]">{course.title || 'Untitled'}</span>
        </nav>

        <div className="grid lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-8">
            {/* Header Section */}
            <header>
              <Badge className="mb-4 bg-primary/10 text-primary border-primary/20">
                <Play className="w-3 h-3 mr-1" />
                Course
              </Badge>

              <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4 leading-tight">
                {course.title || 'Untitled Course'}
              </h1>

              {course.description && (
                <p className="text-lg text-muted-foreground mb-6 leading-relaxed">
                  {course.description}
                </p>
              )}

              {/* Meta info */}
              <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground mb-6">
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-warning fill-warning" />
                  <span className="font-medium text-foreground">4.8</span>
                  <span>(1,234 reviews)</span>
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  5,000+ enrolled
                </div>
                <Separator orientation="vertical" className="h-4" />
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4" />
                  {publishDate}
                </div>
              </div>

              {/* Instructor info */}
              <div className="flex items-center gap-4 p-4 rounded-xl bg-muted/50 border border-border/50">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Created by</p>
                  <p className="font-semibold text-foreground">Course Instructor</p>
                </div>
              </div>

              {/* Engagement actions */}
              <div className="pt-2">
                <InteractionBar
                  contentType="course"
                  contentId={courseId}
                  discussRef={discussRef as React.RefObject<HTMLElement>}
                />
              </div>
            </header>

            {/* Featured Image/Video */}
            <div className="relative aspect-video rounded-2xl overflow-hidden bg-gradient-to-br from-primary/10 to-accent/10 group cursor-pointer">
              <img
                src={thumbnailUrl}
                alt={course.title || 'Course thumbnail'}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
              {/* Play button overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black/30 group-hover:bg-black/40 transition-colors">
                <div className="h-20 w-20 rounded-full bg-primary flex items-center justify-center shadow-2xl group-hover:scale-110 transition-transform">
                  <Play className="w-8 h-8 text-primary-foreground fill-primary-foreground ml-1" />
                </div>
              </div>
            </div>

            {/* What you'll learn */}
            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">What you'll learn</h2>
              <Card className="p-6">
                <div className="grid md:grid-cols-2 gap-4">
                  {[
                    'Understand core concepts and fundamentals',
                    'Build real-world projects from scratch',
                    'Master advanced techniques and best practices',
                    'Get hands-on experience with industry tools',
                    'Learn from practical examples and exercises',
                    'Prepare for professional certifications'
                  ].map((item, i) => (
                    <div key={i} className="flex items-start gap-3">
                      <CheckCircle2 className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
                      <span className="text-foreground">{item}</span>
                    </div>
                  ))}
                </div>
              </Card>
            </section>

            {/* Course Content */}
            <section>
              <h2 className="text-2xl font-bold text-foreground mb-4">Course Content</h2>
              
              {loadingBody ? (
                <div className="space-y-4">
                  {[...Array(5)].map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : bodyHtml ? (
                <HighlightOverlay contentType="course" contentId={courseId}>
                  <div
                    className="course-content text-foreground leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: sanitizeHtml(parseBodyToHtml(bodyHtml)) }}
                  />
                </HighlightOverlay>
              ) : (
                <Card className="p-8 text-center border-dashed bg-muted/30">
                  <BookOpen className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
                  <p className="text-muted-foreground">Course content will be available soon.</p>
                </Card>
              )}
            </section>

            {/* Attachments */}
            {course.attachments && course.attachments.length > 0 && (
              <section>
                <h2 className="text-2xl font-bold text-foreground mb-4">Resources</h2>
                <div className="grid gap-3">
                  {course.attachments.map((attachment) => (
                    <a
                      key={attachment.name}
                      href={attachment.url}
                      download
                      className="flex items-center gap-3 p-4 rounded-lg border border-border hover:border-primary/50 hover:bg-muted/50 transition-colors"
                    >
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                        <BookOpen className="w-5 h-5 text-primary" />
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{attachment.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(attachment.size / 1024).toFixed(1)} KB • {attachment.mimeType}
                        </p>
                      </div>
                    </a>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* Sidebar */}
          <div className="lg:col-span-1">
            <div className="sticky top-6">
              <Card className="overflow-hidden shadow-xl border-primary/20">
                {/* Thumbnail preview */}
                <div className="relative aspect-video bg-gradient-to-br from-primary/20 to-accent/20">
                  <img
                    src={thumbnailUrl}
                    alt={course.title || 'Course'}
                    className="w-full h-full object-cover"
                    onError={(e) => {
                      (e.target as HTMLImageElement).style.display = 'none';
                    }}
                  />
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="h-16 w-16 rounded-full bg-white/90 flex items-center justify-center">
                      <Play className="w-6 h-6 text-primary fill-primary ml-1" />
                    </div>
                  </div>
                </div>

                <CardContent className="p-6 space-y-6">
                  {/* Price */}
                  <div className="flex items-baseline gap-2">
                    <span className="text-3xl font-bold text-foreground">Free</span>
                    <span className="text-lg text-muted-foreground line-through">$99</span>
                    <Badge variant="destructive" className="ml-2">Limited time</Badge>
                  </div>

                  {/* CTA Buttons */}
                  <div className="space-y-3">
                    <Button className="w-full" size="lg">
                      <Play className="w-4 h-4 mr-2" />
                      Enroll Now - It's Free
                    </Button>
                    <Button variant="outline" className="w-full" size="lg">
                      <Bookmark className="w-4 h-4 mr-2" />
                      Add to Wishlist
                    </Button>
                  </div>

                  <Separator />

                  {/* Course includes */}
                  <div className="space-y-3">
                    <h4 className="font-semibold text-foreground">This course includes:</h4>
                    <ul className="space-y-2 text-sm">
                      <li className="flex items-center gap-3 text-muted-foreground">
                        <Play className="w-4 h-4 text-primary" />
                        Hours of video content
                      </li>
                      <li className="flex items-center gap-3 text-muted-foreground">
                        <BookOpen className="w-4 h-4 text-primary" />
                        Downloadable resources
                      </li>
                      <li className="flex items-center gap-3 text-muted-foreground">
                        <Award className="w-4 h-4 text-primary" />
                        Certificate of completion
                      </li>
                      <li className="flex items-center gap-3 text-muted-foreground">
                        <Clock className="w-4 h-4 text-primary" />
                        Lifetime access
                      </li>
                    </ul>
                  </div>

                  <Separator />

                  {/* Share */}
                  <div className="flex items-center justify-center gap-4">
                    <Button variant="ghost" size="sm">
                      <Share2 className="w-4 h-4 mr-2" />
                      Share
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        {/* Discuss anchor + Comments Section */}
        <div ref={discussRef} className="mt-12 pt-8 border-t border-border">
          <CommentsSection contentType="course" contentId={courseId} />
        </div>

        {/* Back button */}
        <div className="mt-12 pt-8 border-t border-border">
          <Button variant="outline" asChild>
            <Link to="/">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Home
            </Link>
          </Button>
        </div>
      </div>

      {/* Course content styles */}
      <style>{`
        .course-content h1 { font-size: 2rem; font-weight: 700; margin-top: 2rem; margin-bottom: 1rem; line-height: 1.3; }
        .course-content h2 { font-size: 1.5rem; font-weight: 600; margin-top: 1.75rem; margin-bottom: 0.75rem; line-height: 1.35; }
        .course-content h3 { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; margin-bottom: 0.5rem; line-height: 1.4; }
        .course-content p { margin-bottom: 1rem; line-height: 1.75; }
        .course-content ul { list-style-type: disc; margin-bottom: 1rem; padding-left: 1.75rem; }
        .course-content ol { list-style-type: decimal; margin-bottom: 1rem; padding-left: 1.75rem; }
        .course-content li { margin-bottom: 0.35rem; line-height: 1.7; }
        .course-content li > p { margin-bottom: 0; }
        .course-content blockquote { border-left: 4px solid hsl(var(--primary)); padding: 0.5rem 1rem; margin: 1.5rem 0; background: hsl(var(--muted)/0.4); border-radius: 0 0.25rem 0.25rem 0; }
        .course-content blockquote p { color: hsl(var(--muted-foreground)); font-style: italic; margin-bottom: 0; }
        .course-content pre { background: hsl(var(--muted)); padding: 1.25rem; border-radius: 0.5rem; overflow-x: auto; margin-bottom: 1.25rem; font-family: 'Courier New', Courier, monospace; font-size: 0.9em; line-height: 1.6; white-space: pre; }
        .course-content code { font-family: 'Courier New', Courier, monospace; background: hsl(var(--muted)); padding: 0.15rem 0.4rem; border-radius: 0.25rem; font-size: 0.875em; }
        .course-content pre code { background: none; padding: 0; font-size: inherit; white-space: pre; }
        .course-content figure { margin: 1.5rem 0; text-align: center; }
        .course-content figure img { margin: 0 auto; }
        .course-content figcaption { font-size: 0.875rem; color: hsl(var(--muted-foreground)); margin-top: 0.5rem; }
        .course-content img { max-width: 100%; height: auto; border-radius: 0.5rem; margin: 1.5rem 0; display: block; }
        .course-content a { color: hsl(var(--primary)); text-decoration: underline; }
        .course-content a:hover { text-decoration: none; }
        .course-content hr { margin: 2rem 0; border: none; border-top: 1px solid hsl(var(--border)); }
        .course-content table { width: 100%; border-collapse: collapse; margin-bottom: 1rem; }
        .course-content th, .course-content td { border: 1px solid hsl(var(--border)); padding: 0.75rem; text-align: left; }
        .course-content th { background: hsl(var(--muted)); font-weight: 600; }
      `}</style>
    </PublicLayout>
  );
}
