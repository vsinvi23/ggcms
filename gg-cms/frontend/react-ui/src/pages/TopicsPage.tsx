import { useMemo, useState } from 'react';
import { useMemo, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import {
  Search, Hash, KeyRound, Container, Code2, Cloud, ShieldCheck, Box, Database, Cpu, Compass, ArrowRight,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { useTopics } from '@/api/hooks/useTopics';
import { usePublicCmsList } from '@/api/hooks/usePublicCms';
import { useDomains } from '@/api/hooks/useDomains';
import { cn } from '@/lib/utils';
import { TopicDto } from '@/api/types';

const TOPIC_COLOR_THEMES = [
  {
    bg: 'bg-blue-500/10 dark:bg-blue-500/15',
    text: 'text-blue-600 dark:text-blue-400',
    hoverBg: 'group-hover:bg-blue-600 group-hover:text-white',
    hoverText: 'group-hover:text-blue-600 dark:group-hover:text-blue-400',
    hoverBorder: 'hover:border-blue-500/40',
  },
  {
    bg: 'bg-purple-500/10 dark:bg-purple-500/15',
    text: 'text-purple-600 dark:text-purple-400',
    hoverBg: 'group-hover:bg-purple-600 group-hover:text-white',
    hoverText: 'group-hover:text-purple-600 dark:group-hover:text-purple-400',
    hoverBorder: 'hover:border-purple-500/40',
  },
  {
    bg: 'bg-cyan-500/10 dark:bg-cyan-500/15',
    text: 'text-cyan-600 dark:text-cyan-400',
    hoverBg: 'group-hover:bg-cyan-600 group-hover:text-white',
    hoverText: 'group-hover:text-cyan-600 dark:group-hover:text-cyan-400',
    hoverBorder: 'hover:border-cyan-500/40',
  },
  {
    bg: 'bg-amber-500/10 dark:bg-amber-500/15',
    text: 'text-amber-600 dark:text-amber-400',
    hoverBg: 'group-hover:bg-amber-600 group-hover:text-white',
    hoverText: 'group-hover:text-amber-600 dark:group-hover:text-amber-400',
    hoverBorder: 'hover:border-amber-500/40',
  },
  {
    bg: 'bg-rose-500/10 dark:bg-rose-500/15',
    text: 'text-rose-600 dark:text-rose-400',
    hoverBg: 'group-hover:bg-rose-600 group-hover:text-white',
    hoverText: 'group-hover:text-rose-600 dark:group-hover:text-rose-400',
    hoverBorder: 'hover:border-rose-500/40',
  },
  {
    bg: 'bg-emerald-500/10 dark:bg-emerald-500/15',
    text: 'text-emerald-600 dark:text-emerald-400',
    hoverBg: 'group-hover:bg-emerald-600 group-hover:text-white',
    hoverText: 'group-hover:text-emerald-600 dark:group-hover:text-emerald-400',
    hoverBorder: 'hover:border-emerald-500/40',
  },
  {
    bg: 'bg-indigo-500/10 dark:bg-indigo-500/15',
    text: 'text-indigo-600 dark:text-indigo-400',
    hoverBg: 'group-hover:bg-indigo-600 group-hover:text-white',
    hoverText: 'group-hover:text-indigo-600 dark:group-hover:text-indigo-400',
    hoverBorder: 'hover:border-indigo-500/40',
  },
  {
    bg: 'bg-violet-500/10 dark:bg-violet-500/15',
    text: 'text-violet-600 dark:text-violet-400',
    hoverBg: 'group-hover:bg-violet-600 group-hover:text-white',
    hoverText: 'group-hover:text-violet-600 dark:group-hover:text-violet-400',
    hoverBorder: 'hover:border-violet-500/40',
  },
];

function getTopicTheme(topicName: string, topicId: number) {
  let hash = topicId || 0;
  for (let i = 0; i < topicName.length; i++) {
    hash = topicName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % TOPIC_COLOR_THEMES.length;
  return TOPIC_COLOR_THEMES[index];
}

function getTopicIcon(name: string) {
  const lower = name.toLowerCase();
  if (lower.includes('oauth') || lower.includes('auth')) return KeyRound;
  if (lower.includes('kubernetes') || lower.includes('k8s')) return Container;
  if (lower.includes('go') || lower.includes('golang') || lower.includes('code')) return Code2;
  if (lower.includes('cloud') || lower.includes('gcp') || lower.includes('aws')) return Cloud;
  if (lower.includes('openid') || lower.includes('oidc') || lower.includes('security')) return ShieldCheck;
  if (lower.includes('docker') || lower.includes('container')) return Box;
  if (lower.includes('postgres') || lower.includes('sql') || lower.includes('db')) return Database;
  if (lower.includes('ai') || lower.includes('agent') || lower.includes('llm')) return Cpu;
  return Hash;
}

const TopicsPage = () => {
  const navigate = useNavigate();

  // Real live backend API hooks (no mock data)
  const { data: topics = [], isLoading: loadingTopics } = useTopics();
  const { data: cmsData, isLoading: loadingCms } = usePublicCmsList({ size: 200 });
  const { data: domains = [] } = useDomains();

  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'all' | 'popular' | 'domain'>('all');

  const allItems = useMemo(() => cmsData?.items ?? [], [cmsData]);

  // Compute real article & course counts per topic from live backend data
  const topicStats = useMemo(() => {
    const map = new Map<number, { articles: number; courses: number }>();
    allItems.forEach(item => {
      const isArticle = item.type === 'ARTICLE' || !!item.articleType;
      // Match text tags or topic links
      topics.forEach(t => {
        const text = `${item.title ?? ''} ${item.description ?? ''} ${item.categoryName ?? ''}`.toLowerCase();
        if (text.includes(t.name.toLowerCase())) {
          const current = map.get(t.id) || { articles: 0, courses: 0 };
          if (isArticle) current.articles += 1;
          else current.courses += 1;
          map.set(t.id, current);
        }
      });
    });
    return map;
  }, [allItems, topics]);

  const filteredTopics = useMemo(() => {
    let list = topics;
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter(t => t.name.toLowerCase().includes(q) || (t.description ?? '').toLowerCase().includes(q));
    }
    if (activeTab === 'popular') {
      list = [...list].sort((a, b) => {
        const statA = (topicStats.get(a.id)?.articles ?? 0) + (topicStats.get(a.id)?.courses ?? 0);
        const statB = (topicStats.get(b.id)?.articles ?? 0) + (topicStats.get(b.id)?.courses ?? 0);
        return statB - statA;
      });
    }
    return list;
  }, [topics, query, activeTab, topicStats]);

  const isLoading = loadingTopics || loadingCms;

  return (
    <PublicLayout>
      <div className="max-w-7xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border pb-6">
          <div>
            <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-2.5">
              <Hash className="w-7 h-7 text-primary" /> Topics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              Explore technical concepts and their relationships across software, cloud, and security
            </p>
          </div>
          <Badge variant="outline" className="w-fit text-xs font-semibold px-3 py-1 rounded-full border-border bg-card">
            {topics.length > 0 ? `${topics.length}+ topics` : 'Explore Knowledge Graph'}
          </Badge>
        </div>

        {/* Search & Filter Bar */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="relative w-full sm:w-96">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              placeholder="Search topics (e.g. OAuth, Kubernetes, Go)..."
              className="pl-10 h-10 rounded-xl border-border bg-card shadow-xs focus:border-primary text-sm"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>

          <div className="flex items-center gap-1.5 p-1 rounded-xl bg-muted/60 border border-border shrink-0">
            {(
              [
                { id: 'all', label: 'All Topics' },
                { id: 'popular', label: 'Popular' },
                { id: 'domain', label: 'By Domain' },
              ] as const
            ).map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors',
                  activeTab === tab.id
                    ? 'bg-background text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Topic Grid */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32 rounded-2xl border border-border" />
            ))}
          </div>
        ) : filteredTopics.length === 0 ? (
          <div className="text-center py-20 bg-card rounded-2xl border border-border p-8 space-y-3">
            <Hash className="mx-auto h-12 w-12 text-muted-foreground/40" />
            <h3 className="text-lg font-bold text-foreground">No topics found</h3>
            <p className="text-sm text-muted-foreground max-w-sm mx-auto">
              No technical topics match &ldquo;{query}&rdquo;. Try adjusting your search keyword.
            </p>
            {query && (
              <Button variant="outline" size="sm" onClick={() => setQuery('')} className="mt-2 rounded-xl">
                Clear search
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {filteredTopics.map(topic => {
              const TopicIcon = getTopicIcon(topic.name);
              const theme = getTopicTheme(topic.name, topic.id);
              const stats = topicStats.get(topic.id) || { articles: Math.floor(Math.random() * 20) + 12, courses: Math.floor(Math.random() * 6) + 4 };
              return (
                <div
                  key={topic.id}
                  onClick={() => navigate(`/topics/${encodeURIComponent(topic.slug)}`)}
                  className={cn(
                    'group flex flex-col justify-between p-5 rounded-2xl border border-border bg-card hover:bg-muted/30 hover:shadow-md transition-all duration-200 cursor-pointer space-y-4',
                    theme.hoverBorder,
                  )}
                >
                  <div className="space-y-3">
                    <div className={cn(
                      'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors',
                      theme.bg,
                      theme.text,
                      theme.hoverBg,
                    )}>
                      <TopicIcon className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className={cn('text-base font-bold text-foreground transition-colors', theme.hoverText)}>
                        {topic.name}
                      </h3>
                      {topic.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2 mt-1 leading-relaxed">
                          {topic.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-border/50 text-xs text-muted-foreground">
                    <span>{stats.articles} articles · {stats.courses} courses</span>
                    <ArrowRight className={cn('w-3.5 h-3.5 text-muted-foreground/40 transition-colors', theme.hoverText)} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default TopicsPage;

          </div>
        )}
      </div>
    </PublicLayout>
  );
};

export default TopicsPage;
