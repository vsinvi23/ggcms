import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Award, AtSign, Bell, BookOpen, Check, ClipboardCheck, FileCheck, MessageSquare, Sparkles, type LucideIcon } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Skeleton } from '@/components/ui/skeleton';
import { useMarkAllRead, useMarkRead, useNotifications } from '@/api/hooks/useNotifications';
import type { NotificationDto, NotificationType } from '@/api/types';

const PAGE_SIZE = 10;

const TYPE_ICONS: Record<NotificationType, { icon: LucideIcon; label: string }> = {
  review_decision: { icon: FileCheck, label: 'Review decision' },
  review_assigned: { icon: ClipboardCheck, label: 'Review assigned' },
  content_published: { icon: BookOpen, label: 'Published' },
  comment_reply: { icon: MessageSquare, label: 'Reply' },
  comment_mention: { icon: AtSign, label: 'Mention' },
  enrollment: { icon: BookOpen, label: 'Enrollment' },
  course_completed: { icon: Award, label: 'Course completed' },
  welcome: { icon: Sparkles, label: 'Welcome' },
  general: { icon: Bell, label: 'Notification' },
};

const isInternalLink = (link?: string | null): link is string => !!link && link.startsWith('/') && !link.startsWith('//');

export function NotificationBell({ className }: { className?: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [page, setPage] = useState(1);
  const list = useNotifications({ page, pageSize: PAGE_SIZE, read: unreadOnly ? false : undefined }, open);
  const unread = useNotifications({ page: 1, pageSize: 1, read: false });
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const unreadCount = unread.data?.total ?? 0;

  const onSelect = (n: NotificationDto) => {
    if (!n.read) markRead.mutate(n.id);
    if (isInternalLink(n.link)) {
      setOpen(false);
      navigate(n.link);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className={cn('relative', className)}
          aria-label={`Notifications${unreadCount > 0 ? ` (${unreadCount} unread)` : ''}`}
        >
          <Bell className="h-5 w-5" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-destructive text-xs font-bold text-destructive-foreground">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent align="end" className="w-96 p-0">
        <div className="flex items-center justify-between border-b border-border p-3">
          <h3 className="font-semibold">Notifications</h3>
          <div className="flex items-center gap-1">
            <Button
              variant={unreadOnly ? 'secondary' : 'ghost'}
              size="sm"
              className="h-8 text-xs"
              aria-pressed={unreadOnly}
              onClick={() => {
                setUnreadOnly((v) => !v);
                setPage(1);
              }}
            >
              Unread only
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs"
              disabled={unreadCount === 0 || markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              <Check className="mr-1 h-3 w-3" aria-hidden="true" />
              Mark all read
            </Button>
          </div>
        </div>

        <div className="max-h-[320px] overflow-y-auto" aria-live="polite">
          {list.isLoading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : list.isError ? (
            <p role="alert" className="p-6 text-center text-sm text-destructive">Could not load notifications.</p>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10">
              <Bell className="mb-2 h-10 w-10 text-muted-foreground/30" aria-hidden="true" />
              <p className="text-sm text-muted-foreground">{unreadOnly ? 'No unread notifications' : 'No notifications yet'}</p>
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {items.map((n) => {
                const meta = TYPE_ICONS[n.type] ?? TYPE_ICONS.general;
                const Icon = meta.icon;
                return (
                  <li key={n.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(n)}
                      className={cn('flex w-full items-start gap-3 p-3 text-left hover:bg-muted/50', !n.read && 'bg-primary/5')}
                    >
                      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label={meta.label} />
                      <span className="min-w-0 flex-1">
                        <span className={cn('block text-sm', n.read ? 'font-normal' : 'font-medium')}>
                          {n.title}
                          {!n.read && <span className="sr-only"> (unread)</span>}
                        </span>
                        {n.message && <span className="mt-0.5 line-clamp-2 block text-xs text-muted-foreground">{n.message}</span>}
                        {n.createdAt && (
                          <span className="mt-1 block text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                          </span>
                        )}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between border-t border-border p-2 text-xs">
          <Link to="/account-settings#notifications" className="underline" onClick={() => setOpen(false)}>
            Notification preferences
          </Link>
          {pages > 1 && (
            <div className="flex items-center gap-1">
              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
              <span>{page} / {pages}</span>
              <Button variant="ghost" size="sm" className="h-7 text-xs" disabled={page >= pages} onClick={() => setPage((p) => p + 1)}>Next</Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
