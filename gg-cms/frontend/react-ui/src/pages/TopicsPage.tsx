import { useMemo, useState } from 'react';
import { Search, Hash } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useTopics } from '@/api/hooks/useTopics';
import { TopicChip } from '@/components/public/TopicChip';

const TopicsPage = () => {
  const { data: topics = [], isLoading } = useTopics();
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topics;
    return topics.filter(t => t.name.toLowerCase().includes(q));
  }, [topics, query]);

  return (
    <PublicLayout>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Topics</h1>
          <p className="text-muted-foreground mt-1">Explore technical concepts and their relationships</p>
        </div>

        <div className="relative max-w-lg">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search topics — e.g. OAuth 2.0, Kubernetes, Go…"
            className="pl-9"
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
        </div>

        {isLoading ? (
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: 16 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-24 rounded-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <Hash className="mx-auto h-10 w-10 mb-3 opacity-40" />
            <p>No topics match &ldquo;{query}&rdquo;.</p>
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {filtered.map(topic => (
              <TopicChip key={topic.id} name={topic.name} slug={topic.slug} />
            ))}
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default TopicsPage;
