import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { useAuthProviders } from '@/components/auth/useAuthProviders';
import type { SocialProvider } from '@/api/services/authService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Eye, EyeOff, Mail, Lock, User, Loader2 } from 'lucide-react';

interface AuthModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  defaultTab?: 'login' | 'signup';
  redirectToDashboard?: boolean;
}

export const AuthModal: React.FC<AuthModalProps> = ({ open, onOpenChange, defaultTab = 'login', redirectToDashboard = true }) => {
  const navigate = useNavigate();
  const { login, signup, socialLogin, isLoading } = useAuth();
  const { toast } = useToast();
  const providers = useAuthProviders();

  const [showPassword, setShowPassword] = useState(false);
  const [activeTab, setActiveTab] = useState<'login' | 'signup'>(defaultTab);
  const [loginData, setLoginData] = useState({ email: '', password: '' });
  const [signupData, setSignupData] = useState({ name: '', email: '', password: '', confirmPassword: '' });

  // Reset form when tab changes
  React.useEffect(() => {
    setActiveTab(defaultTab);
  }, [defaultTab]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await login(loginData.email, loginData.password);
    if (error) {
      toast({ title: 'Login Failed', description: error, variant: 'destructive' });
    } else {
      toast({ title: 'Welcome back!', description: 'You have successfully logged in.' });
      onOpenChange(false);
      if (redirectToDashboard) navigate('/dashboard');
    }
  };

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (signupData.password !== signupData.confirmPassword) {
      toast({ title: 'Error', description: 'Passwords do not match', variant: 'destructive' });
      return;
    }
    const { error, info } = await signup(signupData.email, signupData.password, signupData.name);
    if (error) {
      toast({ title: 'Signup Failed', description: error, variant: 'destructive' });
    } else if (info) {
      toast({ title: 'Check your email', description: info });
      setActiveTab('login');
    } else {
      toast({ title: 'Account Created!', description: 'Welcome to the learning platform.' });
      onOpenChange(false);
      if (redirectToDashboard) navigate('/dashboard');
    }
  };

  const handleSocialLogin = (provider: SocialProvider) => {
    void socialLogin(provider, window.location.pathname + window.location.search);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-2 h-12 w-12 rounded-xl bg-primary/10 flex items-center justify-center">
            <span className="text-2xl font-bold text-primary">L</span>
          </div>
          <DialogTitle className="text-2xl">Welcome</DialogTitle>
          <DialogDescription>Sign in to access your learning dashboard</DialogDescription>
        </DialogHeader>
        
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'login' | 'signup')} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-4">
            <TabsTrigger value="login">Login</TabsTrigger>
            <TabsTrigger value="signup">Sign Up</TabsTrigger>
          </TabsList>
          
          <TabsContent value="login">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="modal-login-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="modal-login-email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10"
                    value={loginData.email}
                    onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="modal-login-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="modal-login-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={loginData.password}
                    onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Sign In
              </Button>
            </form>
          </TabsContent>
          
          <TabsContent value="signup">
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="modal-signup-name">Full Name</Label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="modal-signup-name"
                    type="text"
                    placeholder="John Doe"
                    className="pl-10"
                    value={signupData.name}
                    onChange={(e) => setSignupData({ ...signupData, name: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="modal-signup-email">Email</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="modal-signup-email"
                    type="email"
                    placeholder="you@example.com"
                    className="pl-10"
                    value={signupData.email}
                    onChange={(e) => setSignupData({ ...signupData, email: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="modal-signup-password">Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="modal-signup-password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={signupData.password}
                    onChange={(e) => setSignupData({ ...signupData, password: e.target.value })}
                    minLength={12}
                    maxLength={72}
                    autoComplete="new-password"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              
              <p className="text-xs text-muted-foreground -mt-2">At least 12 characters. Avoid common or breached passwords.</p>

              <div className="space-y-2">
                <Label htmlFor="modal-signup-confirm">Confirm Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="modal-signup-confirm"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10"
                    value={signupData.confirmPassword}
                    onChange={(e) => setSignupData({ ...signupData, confirmPassword: e.target.value })}
                    required
                  />
                </div>
              </div>
              
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Create Account
              </Button>
            </form>
          </TabsContent>
        </Tabs>
        
        <SocialButtons providers={providers} onSelect={handleSocialLogin} disabled={isLoading} size="sm" separatorClassName="bg-background" />

        <p className="text-center text-xs text-muted-foreground">
          By continuing, you agree to our{' '}
          <a href="#" className="underline hover:text-foreground">Terms</a>
          {' '}and{' '}
          <a href="#" className="underline hover:text-foreground">Privacy Policy</a>
        </p>
      </DialogContent>
    </Dialog>
  );
};

export default AuthModal;
