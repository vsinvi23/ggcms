import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RichContentEditor } from '@/components/articles/RichContentEditor';
import { ImportSectionItem, ImportLessonItem } from '@/api/services/importService';
import { ContentBlock } from '@/types/content';
import { parseBodyToBlocks } from '@/lib/htmlParser';
import { ChevronDown, ChevronRight, Plus, Trash2, PenLine } from 'lucide-react';

const LESSON_TYPES = [
  { value: 'text', label: 'Text' },
  { value: 'video', label: 'Video' },
  { value: 'quiz', label: 'Quiz' },
];

interface ImportCourseSectionTreeProps {
  sections: ImportSectionItem[];
  onChange: (sections: ImportSectionItem[]) => void;
}

export function ImportCourseSectionTree({ sections, onChange }: ImportCourseSectionTreeProps) {
  const updateSection = (idx: number, patch: Partial<ImportSectionItem>) => {
    onChange(sections.map((s, i) => (i === idx ? { ...s, ...patch } : s)));
  };
  const deleteSection = (idx: number) => {
    onChange(sections.filter((_, i) => i !== idx));
  };
  const addSection = () => {
    onChange([...sections, { title: '', order: sections.length, lessons: [] }]);
  };
  const updateLesson = (secIdx: number, lessonIdx: number, patch: Partial<ImportLessonItem>) => {
    onChange(
      sections.map((s, i) =>
        i === secIdx
          ? { ...s, lessons: s.lessons.map((l, j) => (j === lessonIdx ? { ...l, ...patch } : l)) }
          : s
      )
    );
  };
  const deleteLesson = (secIdx: number, lessonIdx: number) => {
    onChange(
      sections.map((s, i) =>
        i === secIdx ? { ...s, lessons: s.lessons.filter((_, j) => j !== lessonIdx) } : s
      )
    );
  };
  const addLesson = (secIdx: number) => {
    onChange(
      sections.map((s, i) =>
        i === secIdx
          ? {
              ...s,
              lessons: [
                ...s.lessons,
                { title: '', type: 'text', duration: 0, order: s.lessons.length, body: '' },
              ],
            }
          : s
      )
    );
  };

  return (
    <div className="space-y-2 border rounded-md p-3 bg-muted/20">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">Course structure</span>
        <Button size="sm" variant="outline" onClick={addSection}>
          <Plus className="h-3 w-3 mr-1" /> Add section
        </Button>
      </div>
      {sections.length === 0 && (
        <p className="text-xs text-muted-foreground italic">No sections — course will be created as an empty shell.</p>
      )}
      {sections.map((section, secIdx) => (
        <SectionRow
          key={secIdx}
          section={section}
          onUpdate={(patch) => updateSection(secIdx, patch)}
          onDelete={() => deleteSection(secIdx)}
          onUpdateLesson={(lessonIdx, patch) => updateLesson(secIdx, lessonIdx, patch)}
          onDeleteLesson={(lessonIdx) => deleteLesson(secIdx, lessonIdx)}
          onAddLesson={() => addLesson(secIdx)}
        />
      ))}
    </div>
  );
}

function SectionRow({
  section,
  onUpdate,
  onDelete,
  onUpdateLesson,
  onDeleteLesson,
  onAddLesson,
}: {
  section: ImportSectionItem;
  onUpdate: (patch: Partial<ImportSectionItem>) => void;
  onDelete: () => void;
  onUpdateLesson: (lessonIdx: number, patch: Partial<ImportLessonItem>) => void;
  onDeleteLesson: (lessonIdx: number) => void;
  onAddLesson: () => void;
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="border rounded-md bg-background">
      <div className="flex items-center gap-2 px-2 py-1.5">
        <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => setOpen(!open)}>
          {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        </Button>
        <Input
          value={section.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Section title"
          className="h-7 text-sm flex-1"
        />
        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
      {open && (
        <div className="pl-6 pr-2 pb-2 space-y-1.5">
          {section.lessons.map((lesson, lessonIdx) => (
            <LessonRow
              key={lessonIdx}
              lesson={lesson}
              onUpdate={(patch) => onUpdateLesson(lessonIdx, patch)}
              onDelete={() => onDeleteLesson(lessonIdx)}
            />
          ))}
          <Button size="sm" variant="ghost" className="h-6 text-xs" onClick={onAddLesson}>
            <Plus className="h-3 w-3 mr-1" /> Add lesson
          </Button>
        </div>
      )}
    </div>
  );
}

function LessonRow({
  lesson,
  onUpdate,
  onDelete,
}: {
  lesson: ImportLessonItem;
  onUpdate: (patch: Partial<ImportLessonItem>) => void;
  onDelete: () => void;
}) {
  const [contentOpen, setContentOpen] = useState(false);
  const [blocks, setBlocks] = useState<ContentBlock[]>(() => parseBodyToBlocks(lesson.body, 'markdown'));

  const handleBlocksChange = (next: ContentBlock[]) => {
    setBlocks(next);
    onUpdate({ body: JSON.stringify(next) });
  };

  return (
    <div className="border-l-2 border-border/50 pl-2">
      <div className="flex items-center gap-2 py-1">
        <Input
          value={lesson.title}
          onChange={(e) => onUpdate({ title: e.target.value })}
          placeholder="Lesson title"
          className="h-7 text-xs flex-1"
        />
        <Select value={lesson.type} onValueChange={(v) => onUpdate({ type: v })}>
          <SelectTrigger className="h-7 text-xs w-24">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {LESSON_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6"
          title="Edit content"
          onClick={() => setContentOpen(!contentOpen)}
        >
          <PenLine className="h-3 w-3" />
        </Button>
        <Button size="icon" variant="ghost" className="h-6 w-6 text-destructive" onClick={onDelete}>
          <Trash2 className="h-3 w-3" />
        </Button>
      </div>
      {contentOpen && (
        <div className="pb-2">
          <RichContentEditor blocks={blocks} onChange={handleBlocksChange} />
        </div>
      )}
    </div>
  );
}
