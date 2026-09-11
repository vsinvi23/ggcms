import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Factory, ExternalLink, RefreshCw, Sparkles } from 'lucide-react';

export default function FactoryPage() {
  const [iframeKey, setIframeKey] = useState(0);
  const [iframeLoaded, setIframeLoaded] = useState(false);

  // Cloud Run direct URL fallback, local dev server, or reverse-proxy path
  const localFactoryUrl = (import.meta.env.VITE_CONTENT_FACTORY_URL as string) || 'http://localhost:8000/factory/';
  const factoryUrl = window.location.origin.includes('localhost')
    ? localFactoryUrl
    : `${window.location.origin}/factory`;

  const directUrl = window.location.origin.includes('localhost')
    ? localFactoryUrl
    : 'https://content-factory-backend-wuisbddlxq-uc.a.run.app';

  const handleRefresh = () => {
    setIframeLoaded(false);
    setIframeKey((prev) => prev + 1);
  };

  return (
    <DashboardLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-card p-6 rounded-xl border border-border shadow-sm">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Factory className="w-6 h-6" />
              </div>
              <h1 className="text-2xl font-bold tracking-tight text-foreground">
                AI Content Factory
              </h1>
              <Badge variant="outline" className="gap-1 border-primary/40 text-primary">
                <Sparkles className="w-3 h-3 text-primary animate-pulse" />
                Autonomous Engine
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground">
              Knowledge-driven research & multi-agent content generation platform for GG-CMS
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              className="gap-2"
              title="Refresh Factory Console"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button
              variant="default"
              size="sm"
              asChild
              className="gap-2 shadow-md"
            >
              <a href={directUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLink className="w-4 h-4" />
                Launch Full Console
              </a>
            </Button>
          </div>
        </div>

        {/* Embedded Console Container */}
        <Card className="overflow-hidden border-border shadow-sm">
          <CardHeader className="py-3 px-6 bg-muted/40 border-b border-border flex flex-row items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              <CardTitle className="text-sm font-semibold">Console Session</CardTitle>
            </div>
            <CardDescription className="text-xs font-mono">
              Target: {factoryUrl}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0 relative" style={{ height: 'calc(100vh - 240px)', minHeight: '600px' }}>
            {!iframeLoaded && (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10 space-y-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary" />
                <p className="text-sm font-medium text-muted-foreground">Loading AI Content Factory Console...</p>
              </div>
            )}
            <iframe
              key={iframeKey}
              src={factoryUrl}
              title="AI Content Factory Console"
              className="w-full h-full border-0"
              onLoad={() => setIframeLoaded(true)}
              allow="clipboard-write; clipboard-read"
            />
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
