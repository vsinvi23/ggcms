import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  ChevronRight, ChevronDown, Plus, Trash2, GripVertical,
  Layers, BookOpen, FileText, Check, X, Loader2, PenLine,
  AlignLeft, Save,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { RichContentEditor } from '@/components/articles/RichContentEditor';
import { ContentBlock } from '@/types/content';
import { parseBodyToBlocks } from '@/lib/htmlParser';
import { SectionDto, LessonDto } from '@/api/types';
import { useSectionsByCourse, useCreateSection, useUpdateSection, useDeleteSection } from '@/api/hooks/useSections';
import { useCreateLesson, useUpdateLesson, useDeleteLesson } from '@/api/hooks/useLessons';

// ─── Inline editable title ────────────────────────────────────────────────────

function InlineEdit({
  value,
  onSave,
  onCancel,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  onCancel: () => void;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState(value);
  return (
    <div className="flex items-center gap-1 flex-1">
      <Input
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onSave(draft);
          if (e.key === 'Escape') onCancel();
        }}
        placeholder={placeholder}
        className="h-7 text-sm flex-1"
        autoFocus
      />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSave(draft)}>
        <Check className="w-3.5 h-3.5 text-green-500" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
        <X className="w-3.5 h-3.5 text-red-500" />
      </Button>
    </div>
  );
}

// ─── Section description editor ───────────────────────────────────────────────

function SectionDescriptionEditor({
  sectionId,
  initialDescription,
  onSaved,
}: {
  sectionId: number;
  initialDescription?: string | null;
  onSaved?: () => void;
}) {
  const [text, setText] = useState(initialDescription ?? '');
  const [saving, setSaving] = useState(false);
  const updateSection = useUpdateSection();

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateSection.mutateAsync({ id: sectionId, data: { description: text } });
      toast.success('Description saved');
      onSaved?.();
    } catch {
      toast.error('Failed to save description');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-3 space-y-2 border-t border-border bg-muted/10">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Add a description for this chapter (optional)..."
        rows={3}
        className="text-sm resize-none"
      />
      <div className="flex justify-end">
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Description
        </Button>
      </div>
    </div>
  );
}

// ─── Lesson content editor ────────────────────────────────────────────────────

function LessonContentEditor({
  lesson,
  onSaved,
}: {
  lesson: LessonDto;
  onSaved?: () => void;
}) {
  const [blocks, setBlocks] = useState<ContentBlock[]>([]);
  const [saving, setSaving] = useState(false);
  const updateLesson = useUpdateLesson();

  // Parse existing content on mount
  useEffect(() => {
    if (lesson.content) {
      setBlocks(parseBodyToBlocks(lesson.content));
    } else {
      setBlocks([]);
    }
  }, [lesson.content]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const jsonContent = blocks.length > 0 ? JSON.stringify(blocks) : null;
      await updateLesson.mutateAsync({ id: lesson.id, data: { content: jsonContent ?? undefined } });
      toast.success('Lesson content saved');
      onSaved?.();
    } catch {
      toast.error('Failed to save lesson content');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="px-4 py-4 space-y-3 border-t border-border bg-muted/5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Lesson Content</p>
        <Button size="sm" onClick={handleSave} disabled={saving} className="gap-1">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
          Save Content
        </Button>
      </div>
      <RichContentEditor blocks={blocks} onChange={setBlocks} />
    </div>
  );
}

// ─── Lesson row ───────────────────────────────────────────────────────────────

function LessonRow({
  lesson,
  onUpdate,
  onDelete,
}: {
  lesson: LessonDto;
  onUpdate: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [contentOpen, setContentOpen] = useState(false);

  return (
    <div className="border-b border-border/30 last:border-0">
      {/* Row header */}
      <div className="flex items-center gap-2 px-4 py-2 group hover:bg-muted/30 transition-colors">
        <div className="w-4" />
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 cursor-grab" />
        <FileText className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />

        {editing ? (
          <InlineEdit
            value={lesson.title}
            onSave={(v) => { onUpdate(lesson.id, v); setEditing(false); }}
            onCancel={() => setEditing(false)}
            placeholder="Lesson title"
          />
        ) : (
          <span
            className="flex-1 text-sm cursor-pointer hover:text-primary"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {lesson.title}
          </span>
        )}

        <span className="text-xs text-muted-foreground opacity-0 group-hover:opacity-100">
          {lesson.type}
        </span>

        {/* Content indicator */}
        {lesson.content && (
          <span className="w-1.5 h-1.5 rounded-full bg-primary/60 flex-shrink-0" title="Has content" />
        )}

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon" variant="ghost"
            className={cn('h-6 w-6', contentOpen && 'text-primary bg-primary/10')}
            title="Edit content"
            onClick={() => setContentOpen(!contentOpen)}
          >
            <PenLine className="w-3 h-3" />
          </Button>
          <Button
            size="icon" variant="ghost"
            className="h-6 w-6 text-destructive"
            onClick={() => onDelete(lesson.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Content editor panel */}
      {contentOpen && (
        <LessonContentEditor
          lesson={lesson}
          onSaved={() => setContentOpen(false)}
        />
      )}
    </div>
  );
}

// ─── SubSection (level 2) ────────────────────────────────────────────────────

function SubSectionBlock({
  section,
  courseId,
  onUpdate,
  onDelete,
}: {
  section: SectionDto;
  courseId: number;
  onUpdate: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();

  const lessons = section.lessons ?? [];

  const handleAddLesson = async () => {
    try {
      await createLesson.mutateAsync({
        title: 'New Lesson',
        sectionId: section.id,
        order: lessons.length,
        type: 'text',
      });
      setExpanded(true);
    } catch {
      toast.error('Failed to add lesson');
    }
  };

  const handleUpdateLesson = async (id: number, title: string) => {
    if (!title.trim()) return;
    try {
      await updateLesson.mutateAsync({ id, data: { title } });
    } catch {
      toast.error('Failed to update lesson');
    }
  };

  const handleDeleteLesson = async (id: number) => {
    try {
      await deleteLesson.mutateAsync(id);
    } catch {
      toast.error('Failed to delete lesson');
    }
  };

  return (
    <div className="border-l-2 border-border ml-4">
      {/* SubSection header */}
      <div className="flex items-center gap-2 px-3 py-2 group hover:bg-muted/20 transition-colors">
        <GripVertical className="w-3.5 h-3.5 text-muted-foreground/50 cursor-grab" />
        <button
          onClick={() => setExpanded(!expanded)}
          className="p-0.5 hover:bg-muted rounded"
        >
          {expanded
            ? <ChevronDown className="w-3.5 h-3.5" />
            : <ChevronRight className="w-3.5 h-3.5" />}
        </button>
        <BookOpen className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />

        {editing ? (
          <InlineEdit
            value={section.title}
            onSave={(v) => { onUpdate(section.id, v); setEditing(false); }}
            onCancel={() => setEditing(false)}
            placeholder="Sub-chapter title"
          />
        ) : (
          <span
            className="flex-1 text-sm font-medium cursor-pointer hover:text-primary"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {section.title}
          </span>
        )}

        <Badge variant="outline" className="text-xs">{lessons.length} lesson{lessons.length !== 1 ? 's' : ''}</Badge>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon" variant="ghost"
            className={cn('h-6 w-6', descOpen && 'text-primary bg-primary/10')}
            title="Edit description"
            onClick={() => setDescOpen(!descOpen)}
          >
            <AlignLeft className="w-3 h-3" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-6 w-6"
            onClick={handleAddLesson}
            disabled={createLesson.isPending}
            title="Add lesson"
          >
            {createLesson.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          </Button>
          <Button
            size="icon" variant="ghost"
            className="h-6 w-6 text-destructive"
            onClick={() => onDelete(section.id)}
          >
            <Trash2 className="w-3 h-3" />
          </Button>
        </div>
      </div>

      {/* Description editor */}
      {descOpen && (
        <SectionDescriptionEditor
          sectionId={section.id}
          initialDescription={section.description}
          onSaved={() => setDescOpen(false)}
        />
      )}

      {/* Lessons */}
      {expanded && (
        <div className="ml-4 border-l border-border/50">
          {lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              onUpdate={handleUpdateLesson}
              onDelete={handleDeleteLesson}
            />
          ))}
          {lessons.length === 0 && (
            <p className="px-8 py-2 text-xs text-muted-foreground italic">No lessons yet. Click + to add one.</p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Section (level 1) ───────────────────────────────────────────────────────

function SectionBlock({
  section,
  courseId,
  onUpdate,
  onDelete,
}: {
  section: SectionDto;
  courseId: number;
  onUpdate: (id: number, title: string) => void;
  onDelete: (id: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const [editing, setEditing] = useState(false);
  const [descOpen, setDescOpen] = useState(false);

  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();
  const createLesson = useCreateLesson();
  const updateLesson = useUpdateLesson();
  const deleteLesson = useDeleteLesson();

  const childSections = section.childSections ?? [];
  const lessons = section.lessons ?? [];

  const handleAddSubSection = async () => {
    try {
      await createSection.mutateAsync({
        title: 'New Sub-Chapter',
        courseId,
        parentSectionId: section.id,
        order: childSections.length,
      });
      setExpanded(true);
    } catch {
      toast.error('Failed to add sub-chapter');
    }
  };

  const handleAddLesson = async () => {
    try {
      await createLesson.mutateAsync({
        title: 'New Lesson',
        sectionId: section.id,
        order: lessons.length,
        type: 'text',
      });
      setExpanded(true);
    } catch {
      toast.error('Failed to add lesson');
    }
  };

  const handleUpdateSubSection = async (id: number, title: string) => {
    if (!title.trim()) return;
    try {
      await updateSection.mutateAsync({ id, data: { title } });
    } catch {
      toast.error('Failed to update sub-chapter');
    }
  };

  const handleDeleteSubSection = async (id: number) => {
    try {
      await deleteSection.mutateAsync(id);
    } catch {
      toast.error('Failed to delete sub-chapter');
    }
  };

  const handleUpdateLesson = async (id: number, title: string) => {
    if (!title.trim()) return;
    try {
      await updateLesson.mutateAsync({ id, data: { title } });
    } catch {
      toast.error('Failed to update lesson');
    }
  };

  const handleDeleteLesson = async (id: number) => {
    try {
      await deleteLesson.mutateAsync(id);
    } catch {
      toast.error('Failed to delete lesson');
    }
  };

  const totalItems = childSections.length + lessons.length;

  return (
    <div className="border border-border rounded-lg overflow-hidden mb-2">
      {/* Section header */}
      <div className="flex items-center gap-2 p-3 bg-muted/30 group">
        <GripVertical className="w-4 h-4 text-muted-foreground/50 cursor-grab" />
        <button onClick={() => setExpanded(!expanded)} className="p-0.5 hover:bg-muted rounded">
          {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </button>
        <Layers className="w-4 h-4 text-primary flex-shrink-0" />

        {editing ? (
          <InlineEdit
            value={section.title}
            onSave={(v) => { onUpdate(section.id, v); setEditing(false); }}
            onCancel={() => setEditing(false)}
            placeholder="Chapter title"
          />
        ) : (
          <span
            className="flex-1 font-medium text-sm cursor-pointer hover:text-primary"
            onDoubleClick={() => setEditing(true)}
            title="Double-click to rename"
          >
            {section.title}
          </span>
        )}

        <Badge variant="secondary" className="text-xs">{totalItems} item{totalItems !== 1 ? 's' : ''}</Badge>

        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button
            size="icon" variant="ghost"
            className={cn('h-7 w-7', descOpen && 'text-primary bg-primary/10')}
            title="Edit description"
            onClick={() => setDescOpen(!descOpen)}
          >
            <AlignLeft className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-7 w-7" title="Add sub-chapter"
            onClick={handleAddSubSection}
            disabled={createSection.isPending}
          >
            <Layers className="w-3.5 h-3.5 text-blue-500" />
          </Button>
          <Button
            size="icon" variant="ghost" className="h-7 w-7" title="Add lesson"
            onClick={handleAddLesson}
            disabled={createLesson.isPending}
          >
            <Plus className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="icon" variant="ghost"
            className="h-7 w-7 text-destructive"
            onClick={() => onDelete(section.id)}
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        </div>
      </div>

      {/* Description editor */}
      {descOpen && (
        <SectionDescriptionEditor
          sectionId={section.id}
          initialDescription={section.description}
          onSaved={() => setDescOpen(false)}
        />
      )}

      {/* Sub-sections and lessons */}
      {expanded && (
        <div className="border-t border-border">
          {childSections.map((sub) => (
            <SubSectionBlock
              key={sub.id}
              section={sub}
              courseId={courseId}
              onUpdate={handleUpdateSubSection}
              onDelete={handleDeleteSubSection}
            />
          ))}

          {lessons.map((lesson) => (
            <LessonRow
              key={lesson.id}
              lesson={lesson}
              onUpdate={handleUpdateLesson}
              onDelete={handleDeleteLesson}
            />
          ))}

          {childSections.length === 0 && lessons.length === 0 && (
            <p className="p-4 text-center text-xs text-muted-foreground italic">
              No sub-chapters or lessons. Hover to reveal add buttons.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main CourseChapterManager ────────────────────────────────────────────────

interface CourseChapterManagerProps {
  courseId: number;
}

export function CourseChapterManager({ courseId }: CourseChapterManagerProps) {
  const { data: sections = [], isLoading } = useSectionsByCourse(courseId, !!courseId);
  const createSection = useCreateSection();
  const updateSection = useUpdateSection();
  const deleteSection = useDeleteSection();

  const handleAddChapter = async () => {
    try {
      await createSection.mutateAsync({
        title: 'New Chapter',
        courseId,
        order: sections.length,
      });
    } catch {
      toast.error('Failed to add chapter');
    }
  };

  const handleUpdateSection = async (id: number, title: string) => {
    if (!title.trim()) return;
    try {
      await updateSection.mutateAsync({ id, data: { title } });
    } catch {
      toast.error('Failed to update chapter');
    }
  };

  const handleDeleteSection = async (id: number) => {
    try {
      await deleteSection.mutateAsync(id);
    } catch {
      toast.error('Failed to delete chapter');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-foreground">Course Structure</h3>
          <p className="text-xs text-muted-foreground">
            Chapter → Sub-Chapter → Lesson. Double-click titles to rename. Hover rows for actions.
          </p>
        </div>
        <Button size="sm" onClick={handleAddChapter} disabled={createSection.isPending}>
          {createSection.isPending
            ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
            : <Plus className="w-4 h-4 mr-1" />}
          Add Chapter
        </Button>
      </div>

      {sections.map((section) => (
        <SectionBlock
          key={section.id}
          section={section}
          courseId={courseId}
          onUpdate={handleUpdateSection}
          onDelete={handleDeleteSection}
        />
      ))}

      {sections.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          <Layers className="w-10 h-10 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-muted-foreground text-sm mb-3">No chapters yet</p>
          <Button size="sm" onClick={handleAddChapter} disabled={createSection.isPending}>
            <Plus className="w-4 h-4 mr-1" />
            Add First Chapter
          </Button>
        </div>
      )}
    </div>
  );
}
