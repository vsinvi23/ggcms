import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ReviewComment } from '@/types/content';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { formatDistanceToNow } from 'date-fns';
import { Reply, Send } from 'lucide-react';

interface ReviewerCommentThreadProps {
  comments: ReviewComment[];
  onAddComment: (content: string, parentId?: string) => void;
  className?: string;
}

interface CommentItemProps {
  comment: ReviewComment;
  onReply: (parentId: string, content: string) => void;
  level?: number;
}

function CommentItem({ comment, onReply, level = 0 }: CommentItemProps) {
  const [isReplying, setIsReplying] = useState(false);
  const [replyContent, setReplyContent] = useState('');

  const handleSubmitReply = () => {
    if (replyContent.trim()) {
      onReply(comment.id, replyContent);
      setReplyContent('');
      setIsReplying(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  return (
    <div className={cn('', level > 0 && 'ml-8 border-l-2 border-muted pl-4')}>
      <div className="flex gap-3">
        <Avatar className="w-8 h-8 flex-shrink-0">
          <AvatarImage src={comment.authorAvatar} />
          <AvatarFallback className="text-xs bg-primary/10 text-primary">
            {getInitials(comment.authorName)}
          </AvatarFallback>
        </Avatar>
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{comment.authorName}</span>
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.createdAt), { addSuffix: true })}
            </span>
          </div>
          
          <p className="text-sm text-foreground mt-1 whitespace-pre-wrap">
            {comment.content}
          </p>
          
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 mt-1 text-muted-foreground hover:text-foreground"
            onClick={() => setIsReplying(!isReplying)}
          >
            <Reply className="w-3 h-3 mr-1" />
            Reply
          </Button>

          {isReplying && (
            <div className="mt-2 space-y-2">
              <Textarea
                placeholder="Write a reply..."
                value={replyContent}
                onChange={(e) => setReplyContent(e.target.value)}
                rows={2}
                className="text-sm"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleSubmitReply} disabled={!replyContent.trim()}>
                  <Send className="w-3 h-3 mr-1" />
                  Reply
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setIsReplying(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onReply={onReply}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function ReviewerCommentThread({
  comments,
  onAddComment,
  className,
}: ReviewerCommentThreadProps) {
  const [newComment, setNewComment] = useState('');

  const handleSubmit = () => {
    if (newComment.trim()) {
      onAddComment(newComment);
      setNewComment('');
    }
  };

  const handleReply = (parentId: string, content: string) => {
    onAddComment(content, parentId);
  };

  return (
    <div className={cn('space-y-4', className)}>
      <div className="space-y-4">
        {comments.map((comment) => (
          <CommentItem key={comment.id} comment={comment} onReply={handleReply} />
        ))}
      </div>

      {comments.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No comments yet. Be the first to add a comment.
        </p>
      )}

      <div className="pt-4 border-t border-border space-y-2">
        <Textarea
          placeholder="Add a comment..."
          value={newComment}
          onChange={(e) => setNewComment(e.target.value)}
          rows={3}
        />
        <Button onClick={handleSubmit} disabled={!newComment.trim()}>
          <Send className="w-4 h-4 mr-2" />
          Add Comment
        </Button>
      </div>
    </div>
  );
}
