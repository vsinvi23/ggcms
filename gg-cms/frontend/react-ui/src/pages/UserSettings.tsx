import { useState } from 'react';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConnectedAccounts } from '@/components/auth/ConnectedAccounts';
import { ConsentCard, DataExportCard, PreferencesForm } from '@/components/settings/PreferencesSections';
import { DeleteAccountCard } from '@/components/settings/DeleteAccountCard';
import { useChangePassword } from '@/api/hooks/useChangePassword';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { toUserMessage } from '@/lib/errors';
import { Key, Eye, EyeOff, LogOut, Shield } from 'lucide-react';

export default function UserSettings() {
  const { logout } = useAuth();
  const changePassword = useChangePassword();
  const [showPassword, setShowPassword] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const handleChangePassword = () => {
    if (!currentPassword || !newPassword || !confirmPassword) {
      toast.error(toUserMessage(undefined, 'Please fill in all password fields'));
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error(toUserMessage(undefined, 'New passwords do not match'));
      return;
    }
    if (newPassword.length < 8) {
      toast.error(toUserMessage(undefined, 'Password must be at least 8 characters'));
      return;
    }
    changePassword.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          toast.success('Password changed successfully');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmPassword('');
        },
        onError: (err: Error) => toast.error(toUserMessage(err, 'Failed to change password')),
      },
    );
  };

  return (
    <DashboardLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold text-foreground">Account Settings</h1>
          <p className="text-muted-foreground">Manage your account, notifications and privacy</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" aria-hidden="true" />
              Change Password
            </CardTitle>
            <CardDescription>Update your password to keep your account secure</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="currentPassword">Current Password</Label>
              <div className="relative">
                <Input
                  id="currentPassword"
                  type={showPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  autoComplete="current-password"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-0 top-0 h-full"
                  aria-label={showPassword ? 'Hide passwords' : 'Show passwords'}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password"
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">Confirm New Password</Label>
              <Input
                id="confirmPassword"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm new password"
                autoComplete="new-password"
              />
            </div>
            <Button onClick={handleChangePassword} disabled={changePassword.isPending}>
              Update Password
            </Button>
          </CardContent>
        </Card>

        <ConnectedAccounts />

        <PreferencesForm />
        <ConsentCard />
        <DataExportCard />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="w-5 h-5" aria-hidden="true" />
              Session
            </CardTitle>
            <CardDescription>Sign out of this browser</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" className="w-full" onClick={logout}>
              <LogOut className="w-4 h-4 mr-2" />
              Sign Out
            </Button>
          </CardContent>
        </Card>

        <DeleteAccountCard onDeleted={logout} />
      </div>
    </DashboardLayout>
  );
}
