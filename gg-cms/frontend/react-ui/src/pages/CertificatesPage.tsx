import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Award, Download, Link2, Linkedin, Loader2, ShieldOff } from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useMyCertificates } from '@/api/hooks/useCertificates';
import { certificateService } from '@/api/services/certificateService';
import { CertificateDto } from '@/api/types';
import { toUserMessage } from '@/lib/errors';

function CertificateCard({ cert }: { cert: CertificateDto }) {
  const [downloading, setDownloading] = useState(false);

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const blob = await certificateService.downloadPdf(cert.code);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `certificate-${cert.code}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error(toUserMessage(err, 'Could not download the certificate.'));
    } finally {
      setDownloading(false);
    }
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(cert.verifyUrl);
      toast.success('Verification link copied');
    } catch {
      toast.error('Could not copy the link.');
    }
  };

  return (
    <Card>
      <CardContent className="p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="p-2 rounded-lg bg-primary/10 text-primary shrink-0">
              <Award className="w-5 h-5" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-sm leading-snug">{cert.courseTitle}</h3>
              <p className="text-xs text-muted-foreground">Awarded to {cert.recipientName}</p>
              <p className="text-xs text-muted-foreground">
                Issued {format(new Date(cert.issuedAt), 'MMM d, yyyy')}
                {cert.score !== null && ` · Score ${Math.round(cert.score)}%`}
              </p>
            </div>
          </div>
          {cert.revoked && (
            <Badge variant="destructive" className="shrink-0 gap-1">
              <ShieldOff className="w-3 h-3" aria-hidden="true" /> Revoked
            </Badge>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {!cert.revoked && (
            <Button size="sm" onClick={handleDownload} disabled={downloading} className="rounded-xl text-xs font-bold gap-1.5">
              {downloading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Download className="w-3.5 h-3.5" />}
              Download PDF
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={handleCopy} className="rounded-xl text-xs font-bold gap-1.5">
            <Link2 className="w-3.5 h-3.5" aria-hidden="true" /> Copy verification link
          </Button>
          {!cert.revoked && cert.linkedInUrl && (
            <Button size="sm" variant="outline" asChild className="rounded-xl text-xs font-bold gap-1.5">
              <a href={cert.linkedInUrl} target="_blank" rel="noopener noreferrer">
                <Linkedin className="w-3.5 h-3.5" aria-hidden="true" /> Add to LinkedIn
              </a>
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

const CertificatesPage = () => {
  const { data: certificates = [], isLoading, isError, refetch } = useMyCertificates();

  return (
    <DashboardLayout>
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">My Certificates</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Proof of the courses you have completed. Share the verification link or add it to LinkedIn.</p>
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4" role="status" aria-label="Loading certificates">
            {[0, 1].map(i => <Skeleton key={i} className="h-36 rounded-lg" />)}
          </div>
        ) : isError ? (
          <div role="alert" className="text-center py-16 space-y-3">
            <p className="text-sm text-muted-foreground">Could not load your certificates.</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button>
          </div>
        ) : certificates.length === 0 ? (
          <div role="status" className="text-center py-16 text-muted-foreground">
            <Award className="mx-auto h-14 w-14 mb-4 opacity-30" aria-hidden="true" />
            <p className="text-lg font-medium">No certificates yet</p>
            <p className="text-sm mt-1">Complete a course to earn your first certificate.</p>
            <Button asChild variant="outline" className="mt-4"><Link to="/my-learning">Go to My Learning</Link></Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {certificates.map(c => <CertificateCard key={c.code} cert={c} />)}
          </div>
        )}
      </div>
    </DashboardLayout>
  );
};

export default CertificatesPage;
