import { useState } from 'react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { MessageSquare, Reply } from 'lucide-react';
import { toast } from 'sonner';
import { useReviewComments, useCreateComment } from '@/api/hooks/useReviewComments';
import { ReviewCommentDto, ReviewCommentContentType } from '@/api/types';

interface FlatComment {
  id: string;
  authorName: string;
  content: string;
  timestamp: string;
  replies: FlatComment[];
}

function adaptComment(dto: ReviewCommentDto): FlatComment {
  return {
    id: String(dto.id),
    authorName: dto.author?.name ?? 'Anonymous',
    content: dto.content,
    timestamp: dto.createdAt,
    replies: (dto.replies ?? []).map(adaptComment),
  };
}

const CommentItem = ({
  comment,
  isReply = false,
  onReply,
}: {
  comment: FlatComment;
  isReply?: boolean;
  onReply?: (parentId: string, content: string) => void;
}) => {
  const [replyOpen, setReplyOpen] = useState(false);
  const [replyText, setReplyText] = useState('');

  const handleSubmitReply = () => {
    if (replyText.trim() && onReply) {
      onReply(comment.id, replyText.trim());
      setReplyText('');
      setReplyOpen(false);
    }
  };

  const formatTs = (ts: string) => {
    try {
      return new Date(ts).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    } catch {
      return ts;
    }
  };

  const initials = comment.authorName.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();

  return (
    <div className={`flex gap-3 ${isReply ? 'ml-8 mt-3' : ''}`}>
      <Avatar className={`${isReply ? 'h-8 w-8' : 'h-10 w-10'} border border-border flex-shrink-0`}>
        <AvatarFallback className="bg-primary/10 text-primary text-xs font-semibold">
          {initials}
        </AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className={`font-semibold text-foreground ${isReply ? 'text-sm' : ''}`}>
            {comment.authorName}
          </span>
          <span className="text-xs text-muted-foreground">{formatTs(comment.timestamp)}</span>
        </div>
        <p className={`text-muted-foreground ${isReply ? 'text-sm' : ''} leading-relaxed break-words`}>
          {comment.content}
        </p>
        {!isReply && onReply && (
          <div className="mt-2">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground hover:text-primary"
              onClick={() => setReplyOpen(v => !v)}
            >
              <Reply className="h-3.5 w-3.5 mr-1" />
              <span className="text-xs">Reply</span>
            </Button>
          </div>
        )}
        {replyOpen && (
          <div className="mt-2 space-y-2">
            <Textarea
              placeholder="Write a reply..."
              value={replyText}
              onChange={e => setReplyText(e.target.value)}
              className="min-h-[60px] resize-none text-sm"
            />
            <div className="flex gap-2">
              <Button size="sm" onClick={handleSubmitReply} disabled={!replyText.trim()}>
                Post Reply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setReplyOpen(false)}>
                Cancel
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

interface CommentsSectionProps {
  contentType: ReviewCommentContentType;
  contentId: number;
}

export function CommentsSection({ contentType, contentId }: CommentsSectionProps) {
  const [newComment, setNewComment] = useState('');

  const { data: rawComments = [] } = useReviewComments(
    contentType,
    String(contentId),
    !!contentId,
  );
  const comments = (rawComments as ReviewCommentDto[]).map(adaptComment);

  const { mutateAsync: createComment, isPending } = useCreateComment();

  const handlePost = async () => {
    if (!newComment.trim()) return;
    try {
      await createComment({ content: newComment.trim(), contentType, contentId: String(contentId) });
      setNewComment('');
      toast.success('Comment posted');
    } catch {
      toast.error('Failed to post comment');
    }
  };

  const handleReply = async (parentId: string, content: string) => {
    try {
      await createComment({ content, contentType, contentId: String(contentId), parentId });
      toast.success('Reply posted');
    } catch {
      toast.error('Failed to post reply');
    }
  };

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-6">
        <MessageSquare className="h-5 w-5 text-primary" />
        <h3 className="text-xl font-bold text-foreground">
          Comments ({comments.length})
        </h3>
      </div>

      <Card className="border-border mb-6">
        <CardContent className="p-4">
          <Textarea
            placeholder={`Share your thoughts on this ${contentType}...`}
            value={newComment}
            onChange={e => setNewComment(e.target.value)}
            className="mb-3 min-h-[80px] resize-none"
          />
          <div className="flex justify-end">
            <Button size="sm" onClick={handlePost} disabled={!newComment.trim() || isPending}>
              Post Comment
            </Button>
          </div>
        </CardContent>
      </Card>

      {comments.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          No comments yet. Be the first to share your thoughts!
        </p>
      ) : (
        <div className="space-y-6">
          {comments.map((comment) => (
            <div key={comment.id} className="border-b border-border pb-6 last:border-0">
              <CommentItem comment={comment} onReply={handleReply} />
              {comment.replies.length > 0 && (
                <div className="mt-3 space-y-3 border-l-2 border-primary/20 pl-4 ml-5">
                  {comment.replies.map((reply) => (
                    <CommentItem key={reply.id} comment={reply} isReply />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { Separator };
