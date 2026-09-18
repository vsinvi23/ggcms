import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Sparkles, CheckCircle2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

interface NextStepBannerProps {
  title: string;
  description: string;
  ctaText: string;
  targetUrl: string;
  completedLabel?: string;
  topicBadge?: string;
}

export function NextStepBanner({
  title,
  description,
  ctaText,
  targetUrl,
  completedLabel = "Finished reading?",
  topicBadge = "Recommended Next Step",
}: NextStepBannerProps) {
  const navigate = useNavigate();

  return (
    <div className="my-10 bg-gradient-to-r from-primary/10 via-card to-card border border-primary/30 rounded-3xl p-6 sm:p-8 space-y-4 shadow-sm relative overflow-hidden">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2">
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" /> {completedLabel}
            </span>
            <Badge variant="outline" className="text-[10px] font-bold text-primary border-primary/30">
              {topicBadge}
            </Badge>
          </div>
          <h4 className="text-xl font-extrabold text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
        </div>

        <Button
          onClick={() => navigate(targetUrl)}
          className="rounded-2xl px-6 h-11 font-bold text-xs shrink-0 shadow-xs"
        >
          {ctaText} <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}
