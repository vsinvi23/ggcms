import React, { useState } from 'react';
import { PublicFooter } from './PublicFooter';
import { GGLogo } from '@/components/shared/GGLogo';
import { FloatingPersonalizationButton } from '@/components/personalization/FloatingPersonalizationButton';
import { Link, useLocation } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  BookOpen, GraduationCap, FileText, Briefcase, Menu, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';
import { AuthModal } from '@/components/auth/AuthModal';

interface PublicLayoutProps {
  children: React.ReactNode;
  /** Pass true on pages that embed their own search bar. */
  hideSearch?: boolean;
}

const allNavItems = [
  { icon: BookOpen,      label: 'Courses',        href: '/explore/courses',   flag: null },
  { icon: GraduationCap, label: 'Learning Paths',  href: '/explore/paths',     flag: 'learning_paths' as const },
  { icon: FileText,      label: 'Articles',        href: '/explore/articles',  flag: null },
  { icon: Briefcase,     label: 'Interview Prep',  href: '/explore/interview', flag: 'interview_prep' as const },
];

export function PublicLayout({ children, hideSearch: _hideSearch = false }: PublicLayoutProps) {
  const location = useLocation();
  const { isAuthenticated, user, logout } = useAuth();
  const flags = useFeatureFlags();
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab]             = useState<'login' | 'signup'>('login');

  const navItems = allNavItems.filter(item => item.flag === null || flags[item.flag]);

  const openAuth = (tab: 'login' | 'signup') => {
    setAuthTab(tab);
    setAuthModalOpen(true);
    setMobileOpen(false);
  };

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">

      {/* ── Dark header — Logo | nav tabs | auth ─────────────────────────────── */}
      <header className="shrink-0 bg-sidebar border-b border-sidebar-border z-30">
        <div className="flex items-center h-14 px-4 lg:px-6">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 shrink-0 mr-2">
            <GGLogo size={32} />
            <span className="text-base font-bold text-sidebar-foreground hidden sm:block">GeekGully</span>
          </Link>

          {/* Nav tabs */}
          <nav className="hidden sm:flex items-center flex-1 gap-0 overflow-x-auto">
            {navItems.map(item => {
              const active = location.pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    'flex items-center gap-2 px-4 h-14 text-sm font-semibold border-b-2 transition-colors whitespace-nowrap',
                    active
                      ? 'border-sidebar-primary-foreground text-sidebar-foreground'
                      : 'border-transparent text-sidebar-foreground/50 hover:text-sidebar-foreground hover:border-sidebar-foreground/30',
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth — right side */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {isAuthenticated ? (
              <>
                <Link to="/dashboard" className="hidden sm:block">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent border border-sidebar-border/50"
                  >
                    Dashboard
                  </Button>
                </Link>
                <div
                  onClick={logout}
                  title={`${user?.name} · Sign out`}
                  className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold cursor-pointer select-none"
                >
                  {user?.name?.charAt(0).toUpperCase()}
                </div>
              </>
            ) : (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  className="hidden sm:flex text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                  onClick={() => openAuth('login')}
                >
                  Sign In
                </Button>
                <Button size="sm" className="hidden sm:flex" onClick={() => openAuth('signup')}>
                  Get Started
                </Button>
              </>
            )}

            {/* Mobile hamburger */}
            <Button
              variant="ghost"
              size="icon"
              className="sm:hidden text-sidebar-foreground hover:bg-sidebar-accent"
              onClick={() => setMobileOpen(v => !v)}
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <span className="h-5 w-5 flex flex-col gap-1 justify-center items-center"><span className="w-4 h-0.5 bg-current" /><span className="w-4 h-0.5 bg-current" /><span className="w-4 h-0.5 bg-current" /></span>}
            </Button>
          </div>
        </div>

        {/* Mobile dropdown */}
        {mobileOpen && (
          <div className="sm:hidden border-t border-sidebar-border bg-sidebar px-4 py-3 space-y-1">
            {navItems.map(item => (
              <Link
                key={item.href}
                to={item.href}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  location.pathname.startsWith(item.href)
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
            {isAuthenticated ? (
              <Link to="/dashboard" onClick={() => setMobileOpen(false)}>
                <Button variant="ghost" size="sm" className="w-full mt-2 text-sidebar-foreground border border-sidebar-border/50">
                  Dashboard
                </Button>
              </Link>
            ) : (
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" size="sm" onClick={() => openAuth('signup')}>Get Started</Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="flex-1 text-sidebar-foreground border border-sidebar-border/50"
                  onClick={() => openAuth('login')}
                >
                  Sign In
                </Button>
              </div>
            )}
          </div>
        )}
      </header>

      {/* ── Page content ──────────────────────────────────────────────────────── */}
      <main className="flex-1 overflow-auto bg-background">
        {children}
        <PublicFooter />
      </main>

      <AuthModal open={authModalOpen} onOpenChange={setAuthModalOpen} defaultTab={authTab} />
    </div>
  );
}
