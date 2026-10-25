import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useRetention } from '@/api/hooks/usePrivacy';
import { openPrivacySettings } from '@/lib/consent';

export default function PrivacyPage() {
  const { data, isLoading, isError } = useRetention();

  const rows = data
    ? [
        ['Raw analytics events', `${data.analyticsRawEventsDays} days`],
        ['Aggregated analytics rollups', `${data.analyticsRollupDays} days`],
        ['Read notifications', `${data.readNotificationsDays} days`],
        ['Sent email log', `${data.sentEmailLogDays} days`],
      ]
    : [];

  return (
    <PublicLayout>
      <div className="mx-auto max-w-3xl space-y-6 px-4 py-10">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Privacy and data retention</h1>
          <p className="mt-2 text-muted-foreground">
            How long we keep your data and how to control it.
            {data && ` Consent policy version ${data.consentPolicyVersion}.`}
          </p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Retention periods</CardTitle>
            <CardDescription>Data is deleted or aggregated after these periods.</CardDescription>
          </CardHeader>
          <CardContent aria-live="polite">
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : isError || !data ? (
              <p role="alert" className="text-sm text-destructive">Could not load retention information.</p>
            ) : (
              <>
                <dl className="divide-y divide-border">
                  {rows.map(([label, value]) => (
                    <div key={label} className="flex justify-between py-2 text-sm">
                      <dt className="text-muted-foreground">{label}</dt>
                      <dd className="font-medium">{value}</dd>
                    </div>
                  ))}
                </dl>
                <p className="mt-4 text-sm">
                  <span className="font-medium">Account deletion: </span>
                  {data.accountDeletion}
                </p>
              </>
            )}
          </CardContent>
        </Card>

        <Button variant="outline" onClick={openPrivacySettings}>Change my privacy settings</Button>
      </div>
    </PublicLayout>
  );
}
