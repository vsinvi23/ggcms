import { useSearchParams, Link } from 'react-router-dom';
import { PublicLayout } from '@/components/layout/PublicLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useUnsubscribe } from '@/api/hooks/usePrivacy';
import { toUserMessage } from '@/lib/errors';

export default function UnsubscribePage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const unsubscribe = useUnsubscribe();

  return (
    <PublicLayout>
      <div className="mx-auto max-w-lg px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Unsubscribe from emails</CardTitle>
            <CardDescription>You will stop receiving notification and digest emails. In-app notifications are unaffected.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4" aria-live="polite">
            {!token ? (
              <p role="alert" className="text-sm text-destructive">This unsubscribe link is missing its token.</p>
            ) : unsubscribe.isSuccess ? (
              <p className="text-sm">You have been unsubscribed. You can re-enable emails in <Link to="/account-settings" className="underline">Account Settings</Link>.</p>
            ) : (
              <>
                {unsubscribe.isError && (
                  <p role="alert" className="text-sm text-destructive">
                    {toUserMessage(unsubscribe.error, 'This link is invalid or has expired.')}
                  </p>
                )}
                <Button onClick={() => unsubscribe.mutate(token)} disabled={unsubscribe.isPending}>
                  {unsubscribe.isPending ? 'Unsubscribing...' : 'Confirm unsubscribe'}
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </PublicLayout>
  );
}
