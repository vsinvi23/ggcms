import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { BadgeCheck, ShieldAlert, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Button } from '@/components/ui/button';
import { usePageMeta } from '@/hooks/usePageMeta';
import { useVerifyCertificate } from '@/api/hooks/useCertificates';

const VerifyCertificatePage = () => {
  const { code = '' } = useParams<{ code: string }>();
  const { data, isLoading, isError, refetch } = useVerifyCertificate(code);

  usePageMeta({ title: 'Certificate verification' });

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => meta.remove();
  }, []);

  return (
    <PublicLayout>
      <div className="max-w-xl mx-auto px-4 py-16">
        <div role="status" aria-live="polite" className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground flex items-center justify-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Verifying certificate…
            </p>
          ) : isError ? (
            <>
              <p className="text-sm text-muted-foreground">We could not verify this certificate right now.</p>
              <Button variant="outline" size="sm" onClick={() => refetch()}>Try again</Button>
            </>
          ) : data?.valid ? (
            <>
              <BadgeCheck className="w-14 h-14 text-emerald-500 mx-auto" aria-hidden="true" />
              <h1 className="text-2xl font-extrabold">Valid certificate</h1>
              <dl className="text-sm space-y-1">
                <div><dt className="inline text-muted-foreground">Awarded to: </dt><dd className="inline font-semibold">{data.recipientName}</dd></div>
                <div><dt className="inline text-muted-foreground">Course: </dt><dd className="inline font-semibold">{data.courseTitle}</dd></div>
                {data.issuedAt && <div><dt className="inline text-muted-foreground">Issued: </dt><dd className="inline font-semibold">{format(new Date(data.issuedAt), 'MMM d, yyyy')}</dd></div>}
                <div><dt className="inline text-muted-foreground">Issuer: </dt><dd className="inline font-semibold">{data.issuer ?? 'GeekGully'}</dd></div>
              </dl>
            </>
          ) : (
            <>
              <ShieldAlert className="w-14 h-14 text-rose-500 mx-auto" aria-hidden="true" />
              <h1 className="text-2xl font-extrabold">Certificate not valid</h1>
              <p className="text-sm text-muted-foreground">This certificate code could not be verified. It may be mistyped, unknown, or no longer valid.</p>
            </>
          )}
          <Button asChild variant="ghost" size="sm"><Link to="/">Back to GeekGully</Link></Button>
        </div>
      </div>
    </PublicLayout>
  );
};

export default VerifyCertificatePage;
