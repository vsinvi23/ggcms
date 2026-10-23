import { useState } from 'react';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useDeleteAccount } from '@/api/hooks/usePrivacy';
import { getErrorCode } from '@/api/services/authService';
import { toUserMessage } from '@/lib/errors';

export const DELETE_CONFIRMATION = 'DELETE';

export function DeleteAccountCard({ onDeleted }: { onDeleted: () => void }) {
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [needsPassword, setNeedsPassword] = useState(false);
  const [error, setError] = useState('');
  const del = useDeleteAccount();

  const reset = (next: boolean) => {
    setOpen(next);
    if (!next) {
      setTyped('');
      setPassword('');
      setNeedsPassword(false);
      setError('');
    }
  };

  const submit = () => {
    setError('');
    del.mutate(password || undefined, {
      onSuccess: () => {
        toast.success('Your account has been deleted');
        onDeleted();
      },
      onError: (err: Error) => {
        const code = getErrorCode(err);
        if (code === 'reauth_required') {
          setNeedsPassword(true);
          setError('Please confirm your password to continue.');
        } else {
          setError(toUserMessage(err, 'Could not delete your account.'));
        }
      },
    });
  };

  const confirmed = typed === DELETE_CONFIRMATION && (!needsPassword || password.length > 0);

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-destructive"><Trash2 className="h-5 w-5" aria-hidden="true" />Delete account</CardTitle>
        <CardDescription>
          Permanently deletes your account and personal data (notes, highlights, favourites, notifications, preferences) and signs you out everywhere. This cannot be undone.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => reset(true)}>Delete my account</Button>
      </CardContent>

      <Dialog open={open} onOpenChange={reset}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>Type {DELETE_CONFIRMATION} to confirm. This cannot be undone.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="delete-confirm">Confirmation</Label>
              <Input id="delete-confirm" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
            {needsPassword && (
              <div className="space-y-1">
                <Label htmlFor="delete-password">Password</Label>
                <Input id="delete-password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
              </div>
            )}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => reset(false)}>Cancel</Button>
            <Button variant="destructive" disabled={!confirmed || del.isPending} onClick={submit}>
              {del.isPending ? 'Deleting...' : 'Delete permanently'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
