import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Target, Layers } from 'lucide-react';
import { saveLearningGroup } from '@/lib/learningGroupStore';
import { toast } from 'sonner';

interface CreateLearningGroupModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onGroupCreated: () => void;
}

const PRESET_OBJECTIVES = [
  'Golang Senior Developer Interview',
  'Security Specialist / AppSec Engineer',
  'Cloud Native Solutions Architect',
  'DevOps & Site Reliability Engineer',
  'Full Stack Engineering Mastery',
];

export function CreateLearningGroupModal({
  open,
  onOpenChange,
  onGroupCreated,
}: CreateLearningGroupModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [targetObjective, setTargetObjective] = useState(PRESET_OBJECTIVES[0]);
  const [categoriesStr, setCategoriesStr] = useState('Engineering, Technology');
  const [skillsStr, setSkillsStr] = useState('Go, REST, Backend');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Please enter a group title');
      return;
    }
    const categories = categoriesStr.split(',').map(s => s.trim()).filter(Boolean);
    const skills = skillsStr.split(',').map(s => s.trim()).filter(Boolean);

    saveLearningGroup({
      title: title.trim(),
      description: description.trim(),
      targetObjective,
      categories,
      skills,
    });

    toast.success(`Learning Group "${title.trim()}" created!`);
    setTitle('');
    setDescription('');
    onGroupCreated();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg rounded-2xl border border-border shadow-2xl bg-card">
        <form onSubmit={handleSubmit} className="space-y-4">
          <DialogHeader className="space-y-1.5">
            <DialogTitle className="text-lg font-extrabold flex items-center gap-2">
              <Layers className="w-5 h-5 text-primary" />
              Create Custom Learning Group
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Define a custom parallel learning workspace with target objectives, category combos, and notes.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 pt-2">
            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground">Group Title</label>
              <Input
                placeholder="e.g., Golang Interview Prep"
                value={title}
                onChange={e => setTitle(e.target.value)}
                className="h-9 text-xs rounded-xl bg-background"
                required
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground">Target Objective / Role Goal</label>
              <div className="flex flex-wrap gap-1.5 pb-1">
                {PRESET_OBJECTIVES.map(obj => (
                  <Badge
                    key={obj}
                    variant={targetObjective === obj ? 'default' : 'outline'}
                    onClick={() => setTargetObjective(obj)}
                    className="text-[10px] cursor-pointer"
                  >
                    {obj}
                  </Badge>
                ))}
              </div>
              <Input
                placeholder="Or type custom objective..."
                value={targetObjective}
                onChange={e => setTargetObjective(e.target.value)}
                className="h-8 text-xs rounded-xl bg-background"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-foreground">Description</label>
              <Textarea
                placeholder="Key goals, notes scope, and learning roadmap..."
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="text-xs rounded-xl bg-background min-h-[70px]"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Categories (comma-separated)</label>
                <Input
                  placeholder="Engineering, Cloud"
                  value={categoriesStr}
                  onChange={e => setCategoriesStr(e.target.value)}
                  className="h-8 text-xs rounded-xl bg-background"
                />
              </div>

              <div className="space-y-1">
                <label className="text-xs font-bold text-foreground">Skills (comma-separated)</label>
                <Input
                  placeholder="Go, Docker, REST"
                  value={skillsStr}
                  onChange={e => setSkillsStr(e.target.value)}
                  className="h-8 text-xs rounded-xl bg-background"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="pt-3 border-t border-border">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="rounded-xl text-xs font-semibold"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              className="rounded-xl text-xs font-extrabold bg-primary text-primary-foreground"
            >
              Create Group Workspace
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
