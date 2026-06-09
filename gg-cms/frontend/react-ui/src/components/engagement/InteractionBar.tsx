import { useState } from 'react';
import { ThumbsUp, ThumbsDown, Star, MessageSquare, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import {
  useReactions,
  useReact,
  useUnreact,
  useFavourite,
  useToggleFavourite,
} from '@/api/hooks/useEngagement';
import NotePanel from './NotePanel';

type ContentType = 'article' | 'course';

interface InteractionBarProps {
  contentType: ContentType;
  contentId: number;
  /** Scroll ref for the discuss section (optional). When provided, clicking Discuss scrolls to it. */
  discussRef?: React.RefObject<HTMLElement>;
}

export function InteractionBar({ contentType, contentId, discussRef }: InteractionBarProps) {
  const { user } = useAuth();
  const [noteOpen, setNoteOpen] = useState(false);

  // Reactions
  const { data: reactions } = useReactions(contentType, contentId);
  const { mutate: react, isPending: reacting } = useReact(contentType, contentId);
  const { mutate: unreact } = useUnreact(contentType, contentId);

  // Favourite
  const { data: favData } = useFavourite(contentType, contentId);
  const { mutate: toggleFavourite, isPending: togglingFav } = useToggleFavourite(contentType, contentId);

  const requireAuth = () => {
    toast.info('Sign in to interact with this content');
  };

  const handleLike = () => {
    if (!user) { requireAuth(); return; }
    if (reactions?.userVote === 'like') {
      unreact();
    } else {
      react('like');
    }
  };

  const handleDislike = () => {
    if (!user) { requireAuth(); return; }
    if (reactions?.userVote === 'dislike') {
      unreact();
    } else {
      react('dislike');
    }
  };

  const handleFavourite = () => {
    if (!user) { requireAuth(); return; }
    toggleFavourite();
  };

  const handleDiscuss = () => {
    if (!user) { requireAuth(); return; }
    if (discussRef?.current) {
      discussRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNotes = () => {
    if (!user) { requireAuth(); return; }
    setNoteOpen(true);
  };

  const isFavourited = favData?.isFavourited ?? false;
  const userVote = reactions?.userVote ?? '';

  return (
    <>
      <div className="flex items-center gap-2 flex-wrap">
        {/* Like */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleLike}
          disabled={reacting}
          className={userVote === 'like' ? 'border-primary text-primary bg-primary/10' : ''}
        >
          <ThumbsUp className="w-4 h-4 mr-1.5" />
          Like
          {(reactions?.likes ?? 0) > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {reactions!.likes}
            </span>
          )}
        </Button>

        {/* Dislike */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleDislike}
          disabled={reacting}
          className={userVote === 'dislike' ? 'border-destructive text-destructive bg-destructive/10' : ''}
        >
          <ThumbsDown className="w-4 h-4 mr-1.5" />
          Dislike
          {(reactions?.dislikes ?? 0) > 0 && (
            <span className="ml-1 text-xs font-normal text-muted-foreground">
              {reactions!.dislikes}
            </span>
          )}
        </Button>

        {/* Favourite / Save */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleFavourite}
          disabled={togglingFav}
          className={isFavourited ? 'border-amber-500 text-amber-500 bg-amber-500/10' : ''}
        >
          <Star className={`w-4 h-4 mr-1.5 ${isFavourited ? 'fill-amber-500' : ''}`} />
          {isFavourited ? 'Saved' : 'Save'}
        </Button>

        {/* Discuss */}
        <Button variant="outline" size="sm" onClick={handleDiscuss}>
          <MessageSquare className="w-4 h-4 mr-1.5" />
          Discuss
        </Button>

        {/* Notes */}
        <Button
          variant="outline"
          size="sm"
          onClick={handleNotes}
          className={noteOpen ? 'border-primary text-primary bg-primary/10' : ''}
        >
          <StickyNote className="w-4 h-4 mr-1.5" />
          Notes
        </Button>
      </div>

      {/* Slide-in note panel */}
      {user && (
        <NotePanel
          open={noteOpen}
          onClose={() => setNoteOpen(false)}
          contentType={contentType}
          contentId={contentId}
        />
      )}
    </>
  );
}

export default InteractionBar;
