import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/AuthContext';
import { useConsent, useRetention, useSaveConsent } from '@/api/hooks/usePrivacy';
import { getStoredConsent, OPEN_PRIVACY_EVENT, storeConsent } from '@/lib/consent';
import { isTrackingBlocked } from '@/lib/analytics';
import type { ConsentInput } from '@/api/types';

type Choice = Omit<ConsentInput, 'policyVersion'>;

const CHOICES: { key: keyof Choice; label: string; help: string }[] = [
  { key: 'analytics', label: 'Analytics', help: 'Anonymous-by-default usage statistics tied to a random browser id so we can improve content.' },
  { key: 'personalization', label: 'Personalization', help: 'Use your activity to recommend content.' },
  { key: 'marketing', label: 'Marketing emails', help: 'Product news and announcements by email.' },
];

export function ConsentBanner() {
  const { isAuthenticated } = useAuth();
  const { data: retention } = useRetention();
  const { data: serverConsent } = useConsent(isAuthenticated);
  const saveConsent = useSaveConsent();
  const [bannerOpen, setBannerOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [choice, setChoice] = useState<Choice>({ analytics: false, personalization: false, marketing: false });
  const migrated = useRef(false);

  const policyVersion = serverConsent?.currentPolicyVersion ?? retention?.consentPolicyVersion;

  useEffect(() => {
    if (!policyVersion) return;
    const stored = getStoredConsent();
    if (isAuthenticated && serverConsent?.current && !serverConsent.needsReconsent) {
      const c = serverConsent.current;
      if (stored?.policyVersion !== c.policyVersion || stored.analytics !== c.analytics) {
        storeConsent({ policyVersion: c.policyVersion, analytics: c.analytics, personalization: c.personalization, marketing: c.marketing });
      }
      setBannerOpen(false);
      return;
    }
    if (isAuthenticated && serverConsent && !serverConsent.current && stored && stored.policyVersion === policyVersion && !migrated.current) {
      migrated.current = true;
      saveConsent.mutate({ policyVersion, analytics: stored.analytics, personalization: stored.personalization, marketing: stored.marketing });
    }
    setBannerOpen(!stored || stored.policyVersion !== policyVersion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [policyVersion, isAuthenticated, serverConsent]);

  useEffect(() => {
    const open = () => {
      const stored = getStoredConsent();
      setChoice({
        analytics: stored?.analytics ?? false,
        personalization: stored?.personalization ?? false,
        marketing: stored?.marketing ?? false,
      });
      setManageOpen(true);
    };
    window.addEventListener(OPEN_PRIVACY_EVENT, open);
    return () => window.removeEventListener(OPEN_PRIVACY_EVENT, open);
  }, []);

  const decide = useCallback(
    (c: Choice) => {
      const version = policyVersion ?? 'unknown';
      storeConsent({ policyVersion: version, ...c });
      if (isAuthenticated && policyVersion) saveConsent.mutate({ policyVersion, ...c });
      setBannerOpen(false);
      setManageOpen(false);
    },
    [policyVersion, isAuthenticated, saveConsent],
  );

  return (
    <>
      {bannerOpen && !manageOpen && (
        <section
          role="region"
          aria-label="Cookie and privacy consent"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card p-4 shadow-lg"
        >
          <div className="mx-auto flex max-w-5xl flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <p className="text-sm text-foreground">
              We use optional analytics and personalization to improve GeekGully.
              {isTrackingBlocked() && ' Your browser sends Do Not Track, so analytics stay anonymous.'}{' '}
              <Link to="/privacy" className="underline">Retention and privacy details</Link>.
            </p>
            <div className="flex shrink-0 gap-2">
              <Button variant="outline" onClick={() => decide({ analytics: false, personalization: false, marketing: false })}>
                Reject
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setChoice({ analytics: false, personalization: false, marketing: false });
                  setManageOpen(true);
                }}
              >
                Manage
              </Button>
              <Button onClick={() => decide({ analytics: true, personalization: true, marketing: false })}>Accept</Button>
            </div>
          </div>
        </section>
      )}

      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Privacy settings</DialogTitle>
            <DialogDescription>
              Choose what we may use. Policy version {policyVersion ?? 'loading'}. You can change this at any time.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {CHOICES.map((c) => (
              <div key={c.key} className="flex items-start justify-between gap-4">
                <div>
                  <Label htmlFor={`consent-${c.key}`}>{c.label}</Label>
                  <p className="text-xs text-muted-foreground">{c.help}</p>
                </div>
                <Switch
                  id={`consent-${c.key}`}
                  checked={choice[c.key]}
                  onCheckedChange={(v) => setChoice((prev) => ({ ...prev, [c.key]: v }))}
                />
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setManageOpen(false)}>Cancel</Button>
            <Button onClick={() => decide(choice)}>Save choices</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
