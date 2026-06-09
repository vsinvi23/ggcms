import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { CourseSection, CourseSubsection, Lesson } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  ChevronDown,
  ChevronRight,
  GripVertical,
  Plus,
  Trash2,
  Check,
  X,
  BookOpen,
  Layers,
  FileText,
  Loader2,
} from 'lucide-react';

interface CourseHierarchyEditorProps {
  sections: CourseSection[];
  onSectionsChange: (sections: CourseSection[]) => void;
  onLessonSelect?: (lesson: Lesson, subsectionId: string, sectionId: string) => void;
  selectedLessonId?: string | null;
  autoSaving?: boolean;
  className?: string;
}

interface EditableItemProps {
  value: string;
  onSave: (value: string) => void;
  onCancel: () => void;
  placeholder?: string;
}

function EditableItem({ value, onSave, onCancel, placeholder }: EditableItemProps) {
  const [editValue, setEditValue] = useState(value);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      onSave(editValue);
    } else if (e.key === 'Escape') {
      onCancel();
    }
  };

  return (
    <div className="flex items-center gap-1">
      <Input
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        className="h-7 text-sm"
        autoFocus
      />
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => onSave(editValue)}>
        <Check className="w-4 h-4 text-success" />
      </Button>
      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onCancel}>
        <X className="w-4 h-4 text-destructive" />
      </Button>
    </div>
  );
}

export function CourseHierarchyEditor({
  sections,
  onSectionsChange,
  onLessonSelect,
  selectedLessonId,
  autoSaving = false,
  className,
}: CourseHierarchyEditorProps) {
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(sections.map((s) => s.id))
  );
  const [expandedSubsections, setExpandedSubsections] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);

  const toggleSection = useCallback((sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  }, []);

  const toggleSubsection = useCallback((subsectionId: string) => {
    setExpandedSubsections((prev) => {
      const next = new Set(prev);
      if (next.has(subsectionId)) {
        next.delete(subsectionId);
      } else {
        next.add(subsectionId);
      }
      return next;
    });
  }, []);

  const addSection = () => {
    const newSection: CourseSection = {
      id: `sec-${Date.now()}`,
      title: 'New Section',
      order: sections.length + 1,
      subsections: [],
    };
    onSectionsChange([...sections, newSection]);
    setEditingId(newSection.id);
    setExpandedSections((prev) => new Set(prev).add(newSection.id));
  };

  const addSubsection = (sectionId: string) => {
    const updated = sections.map((section) => {
      if (section.id === sectionId) {
        const newSubsection: CourseSubsection = {
          id: `subsec-${Date.now()}`,
          title: 'New Subsection',
          order: section.subsections.length + 1,
          lessons: [],
        };
        setEditingId(newSubsection.id);
        setExpandedSubsections((prev) => new Set(prev).add(newSubsection.id));
        return {
          ...section,
          subsections: [...section.subsections, newSubsection],
        };
      }
      return section;
    });
    onSectionsChange(updated);
  };

  const addLesson = (sectionId: string, subsectionId: string) => {
    const updated = sections.map((section) => {
      if (section.id === sectionId) {
        return {
          ...section,
          subsections: section.subsections.map((sub) => {
            if (sub.id === subsectionId) {
              const newLesson: Lesson = {
                id: `les-${Date.now()}`,
                title: 'New Lesson',
                order: sub.lessons.length + 1,
                content: '',
                duration: 0,
                attachments: [],
                tags: [],
              };
              setEditingId(newLesson.id);
              return {
                ...sub,
                lessons: [...sub.lessons, newLesson],
              };
            }
            return sub;
          }),
        };
      }
      return section;
    });
    onSectionsChange(updated);
  };

  const updateTitle = (id: string, title: string, type: 'section' | 'subsection' | 'lesson') => {
    if (!title.trim()) {
      setEditingId(null);
      return;
    }

    let updated = sections;
    
    if (type === 'section') {
      updated = sections.map((s) =>
        s.id === id ? { ...s, title } : s
      );
    } else if (type === 'subsection') {
      updated = sections.map((s) => ({
        ...s,
        subsections: s.subsections.map((sub) =>
          sub.id === id ? { ...sub, title } : sub
        ),
      }));
    } else {
      updated = sections.map((s) => ({
        ...s,
        subsections: s.subsections.map((sub) => ({
          ...sub,
          lessons: sub.lessons.map((l) =>
            l.id === id ? { ...l, title } : l
          ),
        })),
      }));
    }

    onSectionsChange(updated);
    setEditingId(null);
  };

  const deleteItem = (id: string, type: 'section' | 'subsection' | 'lesson') => {
    let updated = sections;

    if (type === 'section') {
      updated = sections.filter((s) => s.id !== id);
    } else if (type === 'subsection') {
      updated = sections.map((s) => ({
        ...s,
        subsections: s.subsections.filter((sub) => sub.id !== id),
      }));
    } else {
      updated = sections.map((s) => ({
        ...s,
        subsections: s.subsections.map((sub) => ({
          ...sub,
          lessons: sub.lessons.filter((l) => l.id !== id),
        })),
      }));
    }

    onSectionsChange(updated);
  };

  return (
    <div className={cn('space-y-2', className)}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="font-semibold">Course Structure</h3>
          {autoSaving && (
            <span className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="w-3 h-3 animate-spin" />
              Saving...
            </span>
          )}
        </div>
        <Button size="sm" onClick={addSection}>
          <Plus className="w-4 h-4 mr-1" />
          Add Section
        </Button>
      </div>

      {sections.map((section) => {
        const isExpanded = expandedSections.has(section.id);
        const isEditing = editingId === section.id;

        return (
          <div
            key={section.id}
            className="border border-border rounded-lg overflow-hidden"
          >
            {/* Section Header */}
            <div className="flex items-center gap-2 p-3 bg-muted/50 group">
              <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
              <button
                onClick={() => toggleSection(section.id)}
                className="p-0.5 hover:bg-muted rounded"
              >
                {isExpanded ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </button>
              <Layers className="w-4 h-4 text-primary" />
              
              {isEditing ? (
                <div className="flex-1">
                  <EditableItem
                    value={section.title}
                    onSave={(val) => updateTitle(section.id, val, 'section')}
                    onCancel={() => setEditingId(null)}
                    placeholder="Section title"
                  />
                </div>
              ) : (
                <span
                  className="flex-1 font-medium cursor-pointer hover:text-primary"
                  onDoubleClick={() => setEditingId(section.id)}
                >
                  {section.title}
                </span>
              )}

              <span className="text-xs text-muted-foreground">
                {section.subsections.length} subsection{section.subsections.length !== 1 ? 's' : ''}
              </span>
              
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7"
                  onClick={() => addSubsection(section.id)}
                >
                  <Plus className="w-4 h-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-destructive hover:text-destructive"
                  onClick={() => deleteItem(section.id, 'section')}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Subsections */}
            {isExpanded && (
              <div className="border-t border-border">
                {section.subsections.map((subsection) => {
                  const isSubExpanded = expandedSubsections.has(subsection.id);
                  const isSubEditing = editingId === subsection.id;

                  return (
                    <div key={subsection.id} className="border-b border-border last:border-b-0">
                      <div className="flex items-center gap-2 p-2 pl-10 group hover:bg-muted/30">
                        <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                        <button
                          onClick={() => toggleSubsection(subsection.id)}
                          className="p-0.5 hover:bg-muted rounded"
                        >
                          {isSubExpanded ? (
                            <ChevronDown className="w-4 h-4" />
                          ) : (
                            <ChevronRight className="w-4 h-4" />
                          )}
                        </button>
                        <BookOpen className="w-4 h-4 text-info" />
                        
                        {isSubEditing ? (
                          <div className="flex-1">
                            <EditableItem
                              value={subsection.title}
                              onSave={(val) => updateTitle(subsection.id, val, 'subsection')}
                              onCancel={() => setEditingId(null)}
                              placeholder="Subsection title"
                            />
                          </div>
                        ) : (
                          <span
                            className="flex-1 text-sm cursor-pointer hover:text-primary"
                            onDoubleClick={() => setEditingId(subsection.id)}
                          >
                            {subsection.title}
                          </span>
                        )}

                        <span className="text-xs text-muted-foreground">
                          {subsection.lessons.length} lesson{subsection.lessons.length !== 1 ? 's' : ''}
                        </span>
                        
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => addLesson(section.id, subsection.id)}
                          >
                            <Plus className="w-3 h-3" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive hover:text-destructive"
                            onClick={() => deleteItem(subsection.id, 'subsection')}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>

                      {/* Lessons */}
                      {isSubExpanded && subsection.lessons.length > 0 && (
                        <div className="bg-muted/20">
                          {subsection.lessons.map((lesson) => {
                            const isLessonEditing = editingId === lesson.id;
                            const isSelected = selectedLessonId === lesson.id;

                            return (
                              <div
                                key={lesson.id}
                                className={cn(
                                  'flex items-center gap-2 p-2 pl-16 group cursor-pointer',
                                  'hover:bg-muted/50 transition-colors',
                                  isSelected && 'bg-primary/10'
                                )}
                                onClick={() => onLessonSelect?.(lesson, subsection.id, section.id)}
                              >
                                <GripVertical className="w-4 h-4 text-muted-foreground cursor-grab" />
                                <FileText className="w-4 h-4 text-muted-foreground" />
                                
                                {isLessonEditing ? (
                                  <div className="flex-1" onClick={(e) => e.stopPropagation()}>
                                    <EditableItem
                                      value={lesson.title}
                                      onSave={(val) => updateTitle(lesson.id, val, 'lesson')}
                                      onCancel={() => setEditingId(null)}
                                      placeholder="Lesson title"
                                    />
                                  </div>
                                ) : (
                                  <span
                                    className={cn(
                                      'flex-1 text-sm',
                                      isSelected && 'font-medium text-primary'
                                    )}
                                    onDoubleClick={(e) => {
                                      e.stopPropagation();
                                      setEditingId(lesson.id);
                                    }}
                                  >
                                    {lesson.title}
                                  </span>
                                )}

                                {lesson.duration > 0 && (
                                  <span className="text-xs text-muted-foreground">
                                    {lesson.duration}m
                                  </span>
                                )}
                                
                                <Button
                                  size="icon"
                                  variant="ghost"
                                  className="h-6 w-6 text-destructive hover:text-destructive opacity-0 group-hover:opacity-100"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteItem(lesson.id, 'lesson');
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}

                {section.subsections.length === 0 && (
                  <div className="p-4 text-center text-sm text-muted-foreground">
                    No subsections. Click + to add one.
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {sections.length === 0 && (
        <div className="border border-dashed border-border rounded-lg p-8 text-center">
          <Layers className="w-10 h-10 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-muted-foreground mb-3">No sections yet</p>
          <Button onClick={addSection}>
            <Plus className="w-4 h-4 mr-1" />
            Add First Section
          </Button>
        </div>
      )}
    </div>
  );
}
