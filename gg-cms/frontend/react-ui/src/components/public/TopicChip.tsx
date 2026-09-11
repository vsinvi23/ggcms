import { Link } from 'react-router-dom';
import { cn } from '@/lib/utils';

interface TopicChipProps {
  name: string;
  slug?: string;
  className?: string;
  onClick?: () => void;
}

/** Compact pill for a knowledge-graph Topic — visually distinct from category tree navigation. */
export function TopicChip({ name, slug, className, onClick }: TopicChipProps) {
  const classes = cn(
    'inline-flex items-center px-3 py-1 rounded-full text-sm border border-border',
    'bg-muted/40 text-foreground hover:bg-primary hover:text-primary-foreground hover:border-primary',
    'transition-colors whitespace-nowrap',
    className,
  );

  if (slug) {
    return (
      <Link to={`/topics/${slug}`} className={classes} onClick={onClick}>
        {name}
      </Link>
    );
  }

  return (
    <button type="button" className={classes} onClick={onClick}>
      {name}
    </button>
  );
}
