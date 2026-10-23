import { usePageMeta } from '@/hooks/usePageMeta';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Layers } from 'lucide-react';
import { useDomains } from '@/api/hooks/useDomains';
import { Badge } from '@/components/ui/badge';

export function DomainsPage() {
  usePageMeta({ title: 'Domains', description: 'Browse learning domains across technology.', canonicalPath: '/domains' });
  const { data: domains = [], isLoading, isError } = useDomains();

  return (
    <PublicLayout hideSearch>
      <div className="min-h-screen bg-background text-foreground pb-16">
        
        <div className="relative border-b border-border bg-gradient-to-b from-primary/5 via-transparent to-background pt-12 pb-10 px-4 sm:px-6 lg:px-8">
          <div className="max-w-4xl mx-auto text-center space-y-4">
            <Badge variant="outline" className="px-3 py-1 text-xs font-semibold text-primary border-primary/30 rounded-full">
              Knowledge Domains
            </Badge>
            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight">
              Domain Directory
            </h1>
            <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Explore the knowledge domains covered by our articles and courses.
            </p>
          </div>
        </div>

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 space-y-8">
          <div aria-live="polite">
            {isLoading ? (
              <p role="status" className="text-center text-sm text-muted-foreground py-12">Loading domains...</p>
            ) : isError ? (
              <p role="alert" className="text-center text-sm text-destructive py-12">Could not load domains. Please try again later.</p>
            ) : domains.length === 0 ? (
              <p className="text-center text-sm text-muted-foreground py-12">No domains have been published yet.</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {domains.map(domain => (
                  <div key={domain.id} className="bg-card border border-border rounded-3xl p-6 sm:p-8 space-y-4 shadow-xs">
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 rounded-2xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <Layers className="w-6 h-6" aria-hidden="true" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-extrabold text-foreground">{domain.name}</h2>
                        {domain.description && <p className="text-xs sm:text-sm text-muted-foreground mt-1">{domain.description}</p>}
                      </div>
                    </div>
                    <div className="flex gap-4 text-xs font-semibold text-muted-foreground">
                      <span>{domain.courseCount ?? 0} courses</span>
                      <span>{domain.articleCount ?? 0} articles</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </PublicLayout>
  );
}

export default DomainsPage;
