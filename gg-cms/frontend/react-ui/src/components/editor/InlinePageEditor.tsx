import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card } from '@/components/ui/card';
import {
  Pencil,
  Bold,
  Italic,
  Code,
  Heading2,
  List,
  Save,
  Send,
  X,
  Sparkles,
  ShieldCheck,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';

interface InlinePageEditorProps {
  contentType: 'article' | 'course' | 'learning_path' | 'topic';
  contentId: number | string;
  initialTitle: string;
  initialDescription?: string;
  initialBody?: string;
  isEditing: boolean;
  onClose: () => void;
  onSave: (data: {
    title: string;
    description: string;
    body: string;
    submitForReview: boolean;
  }) => Promise<void>;
}

export function InlinePageEditor({
  contentType,
  contentId,
  initialTitle,
  initialDescription = '',
  initialBody = '',
  isEditing,
  onClose,
  onSave,
}: InlinePageEditorProps) {
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [body, setBody] = useState(initialBody);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isEditing) return null;

  const handleApplyFormat = (tag: string) => {
    let wrapStart = `<${tag}>`;
    let wrapEnd = `</${tag}>`;
    if (tag === 'h2') {
      wrapStart = '<h2>';
      wrapEnd = '</h2>';
    } else if (tag === 'code') {
      wrapStart = '<code>';
      wrapEnd = '</code>';
    } else if (tag === 'ul') {
      wrapStart = '<ul>\n  <li>';
      wrapEnd = '</li>\n</ul>';
    }

    setBody((prev) => `${prev}\n${wrapStart}New content block${wrapEnd}`);
    toast.info(`Inserted <${tag}> block`);
  };

  const handleSaveAction = async (submitForReview: boolean) => {
    setIsSubmitting(true);
    try {
      await onSave({
        title,
        description,
        body,
        submitForReview,
      });
      toast.success(
        submitForReview
          ? 'New version submitted for review!'
          : 'Draft revision saved successfully!'
      );
      onClose();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to save inline edit.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="sticky top-0 z-50 w-full bg-slate-900 border-b-2 border-emerald-500 text-slate-100 p-3 shadow-2xl space-y-3 transition-all animate-in slide-in-from-top-4">
      <div className="max-w-6xl mx-auto flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <Badge className="bg-emerald-500 text-slate-950 font-bold px-2.5 py-1 text-xs gap-1.5 shadow">
            <Sparkles className="w-3.5 h-3.5" /> Confluence-Style Inline Edit Mode
          </Badge>
          <span className="text-xs text-slate-300 font-medium">
            Editing {contentType.toUpperCase()} #{contentId} &bull; Live Canvas In-Place Editor
          </span>
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 text-[11px] gap-1">
            <ShieldCheck className="w-3 h-3 text-emerald-400" /> Super Admin Privileged
          </Badge>
        </div>

        {/* Formatting Quick Tools */}
        <div className="flex items-center gap-1.5 bg-slate-800 p-1 rounded-lg border border-slate-700">
          <button
            type="button"
            onClick={() => handleApplyFormat('b')}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-xs font-bold"
            title="Bold"
          >
            <Bold className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleApplyFormat('i')}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-xs"
            title="Italic"
          >
            <Italic className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleApplyFormat('h2')}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-xs"
            title="Heading 2"
          >
            <Heading2 className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleApplyFormat('code')}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-xs"
            title="Code Block"
          >
            <Code className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={() => handleApplyFormat('ul')}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded transition-colors text-xs"
            title="Unordered List"
          >
            <List className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Save & Cancel Actions */}
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-8 text-xs text-slate-300 hover:text-white hover:bg-slate-800 gap-1 font-semibold"
          >
            <X className="w-3.5 h-3.5" /> Cancel
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => handleSaveAction(false)}
            disabled={isSubmitting}
            className="h-8 text-xs font-semibold gap-1 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700"
          >
            <Save className="w-3.5 h-3.5 text-amber-400" /> Save Draft
          </Button>
          <Button
            size="sm"
            onClick={() => handleSaveAction(true)}
            disabled={isSubmitting}
            className="h-8 text-xs font-bold gap-1 bg-emerald-600 hover:bg-emerald-500 text-white shadow"
          >
            <Send className="w-3.5 h-3.5" /> Submit for Review
          </Button>
        </div>
      </div>

      {/* Inline Editable Fields Section */}
      <div className="max-w-6xl mx-auto pt-2 pb-1 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Inline Title Edit
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="bg-slate-950 border-slate-700 text-white text-sm font-semibold h-9 focus-visible:ring-emerald-500"
          />
        </div>
        <div className="space-y-1">
          <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Inline Description Edit
          </label>
          <Textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-slate-950 border-slate-700 text-white text-xs h-9 min-h-[36px] resize-none focus-visible:ring-emerald-500"
          />
        </div>
        <div className="md:col-span-2 space-y-1">
          <label className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            <Pencil className="w-3 h-3" /> Live Body Content Editor (HTML / Markdown)
          </label>
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="bg-slate-950 border-slate-700 text-slate-100 font-mono text-xs min-h-[160px] focus-visible:ring-emerald-500"
          />
        </div>
      </div>
    </div>
  );
}
