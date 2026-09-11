import { useState } from 'react';
import { useTopics, useCreateTopic } from '@/api/hooks/useTopics';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { X, Plus, Tag as TagIcon, Check, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface TopicMultiSelectProps {
  selectedTopicIds: number[];
  onChange: (ids: number[]) => void;
  disabled?: boolean;
}

export function TopicMultiSelect({ selectedTopicIds, onChange, disabled }: TopicMultiSelectProps) {
  const { data: topics = [], isLoading } = useTopics();
  const createTopic = useCreateTopic();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const selectedTopics = topics.filter((t) => selectedTopicIds.includes(t.id));
  const filteredTopics = topics.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const toggleTopic = (id: number) => {
    if (selectedTopicIds.includes(id)) {
      onChange(selectedTopicIds.filter((tId) => tId !== id));
    } else {
      onChange([...selectedTopicIds, id]);
    }
  };

  const handleCreateTopic = async () => {
    const trimmed = search.trim();
    if (!trimmed) return;
    try {
      const created = await createTopic.mutateAsync({ name: trimmed });
      toast.success(`Topic "${created.name}" created`);
      onChange([...selectedTopicIds, created.id]);
      setSearch('');
    } catch {
      toast.error('Failed to create topic');
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[36px] p-2 border border-input rounded-md bg-background items-center">
        {selectedTopics.map((topic) => (
          <Badge key={topic.id} variant="secondary" className="gap-1 text-xs py-0.5">
            <TagIcon className="w-3 h-3 text-primary" />
            {topic.name}
            {!disabled && (
              <button
                type="button"
                onClick={() => toggleTopic(topic.id)}
                className="hover:text-destructive focus:outline-none"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </Badge>
        ))}

        {!disabled && (
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 px-2 text-muted-foreground hover:text-foreground">
                <Plus className="w-3 h-3" />
                Add Topic
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-64 p-2 space-y-2" align="start">
              <Input
                placeholder="Search or add topic..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-8 text-xs"
                autoFocus
              />

              <div className="max-h-48 overflow-y-auto space-y-1">
                {isLoading ? (
                  <div className="flex items-center justify-center p-3">
                    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                  </div>
                ) : filteredTopics.length > 0 ? (
                  filteredTopics.map((topic) => {
                    const isSelected = selectedTopicIds.includes(topic.id);
                    return (
                      <button
                        key={topic.id}
                        type="button"
                        onClick={() => toggleTopic(topic.id)}
                        className="w-full flex items-center justify-between px-2 py-1.5 text-xs rounded hover:bg-muted text-left"
                      >
                        <span className="truncate">{topic.name}</span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-primary flex-shrink-0" />}
                      </button>
                    );
                  })
                ) : (
                  <p className="text-xs text-muted-foreground p-2 text-center">No matching topics</p>
                )}
              </div>

              {search.trim() && !topics.some((t) => t.name.toLowerCase() === search.trim().toLowerCase()) && (
                <div className="border-t border-border pt-1">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 text-xs gap-1 justify-start"
                    onClick={handleCreateTopic}
                    disabled={createTopic.isPending}
                  >
                    {createTopic.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
                    Create "{search.trim()}"
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
}
