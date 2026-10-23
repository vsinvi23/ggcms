import { useState } from 'react';
import { toast } from 'sonner';
import { Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useAiModeration, useResolveModeration } from '@/api/hooks/useAi';
import { AiErrorNotice, SafeText } from './AiShared';

const PAGE_SIZE = 20;

export function AiModerationPanel() {
  const [page, setPage] = useState(0);
  const q = useAiModeration('pending_review', page);
  const resolve = useResolveModeration();

  const act = async (id: number, approve: boolean) => {
    try {
      await resolve.mutateAsync({ id, approve });
      toast.success(approve ? 'Comment approved' : 'Comment rejected');
    } catch {
      toast.error('Could not update this item. Please try again.');
    }
  };

  if (q.isLoading) return <Skeleton className="h-40 w-full" />;
  if (q.isError) return <AiErrorNotice error={q.error} />;
  const items = q.data?.items ?? [];
  const total = q.data?.total ?? 0;
  if (items.length === 0 && page === 0) return <p className="text-muted-foreground">No comments are waiting for review.</p>;

  return (
    <div className="space-y-3">
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.id} className="rounded-md border p-3">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{it.contentType} #{String(it.contentId)}</span>
              <Badge variant="outline">{it.source}</Badge>
              {it.reasons.map((r) => <Badge key={r} variant="secondary">{r}</Badge>)}
            </div>
            <SafeText text={it.excerpt} className="text-sm" />
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="outline" disabled={resolve.isPending} onClick={() => act(it.id, true)} aria-label={`Approve comment ${it.id}`}>
                <Check className="mr-1 h-4 w-4" aria-hidden="true" /> Approve
              </Button>
              <Button size="sm" variant="ghost" disabled={resolve.isPending} onClick={() => act(it.id, false)} aria-label={`Reject comment ${it.id}`}>
                <X className="mr-1 h-4 w-4" aria-hidden="true" /> Reject
              </Button>
            </div>
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
        <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        <span className="text-xs text-muted-foreground">{total} waiting</span>
      </div>
    </div>
  );
}
