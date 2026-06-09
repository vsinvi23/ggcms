import { cn } from '@/lib/utils';
import { VersionHistory } from '@/types/content';
import { StatusBadge } from './StatusBadge';
import { Button } from '@/components/ui/button';
import { formatDistanceToNow, format } from 'date-fns';
import { History, RotateCcw, Eye } from 'lucide-react';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface VersionHistoryPanelProps {
  versions: VersionHistory[];
  currentVersion?: number;
  onRestore?: (version: VersionHistory) => void;
  onPreview?: (version: VersionHistory) => void;
  className?: string;
}

export function VersionHistoryPanel({
  versions,
  currentVersion,
  onRestore,
  onPreview,
  className,
}: VersionHistoryPanelProps) {
  const sortedVersions = [...versions].sort((a, b) => b.version - a.version);

  return (
    <div className={cn('space-y-4', className)}>
      <div className="flex items-center gap-2">
        <History className="w-5 h-5 text-muted-foreground" />
        <h3 className="font-semibold">Version History</h3>
      </div>

      <div className="space-y-3">
        {sortedVersions.map((version) => {
          const isCurrent = version.version === currentVersion;
          
          return (
            <div
              key={version.id}
              className={cn(
                'relative p-4 rounded-lg border transition-colors',
                isCurrent ? 'border-primary bg-primary/5' : 'border-border bg-card'
              )}
            >
              {isCurrent && (
                <span className="absolute -top-2 right-3 px-2 py-0.5 text-xs font-medium bg-primary text-primary-foreground rounded-full">
                  Current
                </span>
              )}
              
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">
                      Version {version.version}
                    </span>
                    <StatusBadge status={version.status} size="sm" />
                  </div>
                  
                  <p className="text-sm text-muted-foreground mt-1">
                    {version.changes}
                  </p>
                  
                  <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
                    <span>{version.changedBy}</span>
                    <span>•</span>
                    <Tooltip>
                      <TooltipTrigger>
                        <span>
                          {formatDistanceToNow(new Date(version.changedAt), { addSuffix: true })}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {format(new Date(version.changedAt), 'PPpp')}
                      </TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                <div className="flex gap-1">
                  {onPreview && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onPreview(version)}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  )}
                  {onRestore && !isCurrent && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => onRestore(version)}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {versions.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-4">
          No version history available.
        </p>
      )}
    </div>
  );
}
