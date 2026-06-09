import { cn } from '@/lib/utils';
import { Course } from '@/types/content';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Clock, User, BookOpen, MoreHorizontal, Pencil, Eye, Trash2 } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface CourseCardProps {
  course: Course;
  onEdit?: (course: Course) => void;
  onView?: (course: Course) => void;
  onDelete?: (course: Course) => void;
  className?: string;
}

const formatDuration = (minutes: number) => {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
};

const countLessons = (course: Course) => {
  return course.sections.reduce((total, section) => {
    return total + section.subsections.reduce((subTotal, sub) => {
      return subTotal + sub.lessons.length;
    }, 0);
  }, 0);
};

export function CourseCard({
  course,
  onEdit,
  onView,
  onDelete,
  className,
}: CourseCardProps) {
  const lessonCount = countLessons(course);

  return (
    <Card className={cn('group hover:shadow-md transition-shadow', className)}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1">
              {course.categoryPath.map((cat, i) => (
                <span key={i}>
                  {cat}
                  {i < course.categoryPath.length - 1 && ' / '}
                </span>
              ))}
            </div>
            <h3 className="font-semibold text-lg leading-tight line-clamp-2">
              {course.title}
            </h3>
          </div>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <MoreHorizontal className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {onView && (
                <DropdownMenuItem onClick={() => onView(course)}>
                  <Eye className="w-4 h-4 mr-2" />
                  View
                </DropdownMenuItem>
              )}
              {onEdit && (
                <DropdownMenuItem onClick={() => onEdit(course)}>
                  <Pencil className="w-4 h-4 mr-2" />
                  Edit
                </DropdownMenuItem>
              )}
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => onDelete(course)}
                    className="text-destructive"
                  >
                    <Trash2 className="w-4 h-4 mr-2" />
                    Delete
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        <p className="text-sm text-muted-foreground line-clamp-2 mb-4">
          {course.description}
        </p>

        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1">
            <User className="w-4 h-4" />
            {course.instructor}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            {formatDuration(course.duration)}
          </span>
          <span className="flex items-center gap-1">
            <BookOpen className="w-4 h-4" />
            {lessonCount} lesson{lessonCount !== 1 ? 's' : ''}
          </span>
        </div>
      </CardContent>

      <CardFooter className="pt-3 border-t border-border flex items-center justify-between">
        <StatusBadge status={course.status} size="sm" />
        <div className="flex gap-1 flex-wrap justify-end">
          {course.tags.slice(0, 3).map((tag) => (
            <Badge key={tag} variant="secondary" className="text-xs">
              {tag}
            </Badge>
          ))}
          {course.tags.length > 3 && (
            <Badge variant="secondary" className="text-xs">
              +{course.tags.length - 3}
            </Badge>
          )}
        </div>
      </CardFooter>
    </Card>
  );
}
