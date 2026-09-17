import React, { useState, useEffect } from 'react';
import { PublicFooter } from './PublicFooter';
import { GGLogo } from '@/components/shared/GGLogo';
import { FloatingPersonalizationButton } from '@/components/personalization/FloatingPersonalizationButton';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { cn } from '@/lib/utils';
import {
  BookOpen,
  GraduationCap,
  FileText,
  Briefcase,
  Menu,
  X,
  ChevronDown,
  LayoutDashboard,
  User as UserIcon,
  Settings,
  LogOut,
  House,
  Compass,
  Hash,
  Search,

} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useAuth } from '@/contexts/AuthContext';
import { useFeatureFlags } from '@/contexts/FeatureFlagContext';
import { AuthModal } from '@/components/auth/AuthModal';
import { GlobalSearchModal } from '@/components/shared/GlobalSearchModal';

interface PublicLayoutProps {
  children: React.ReactNode;
  /** Pass true on pages that embed their own search bar. */
  hideSearch?: boolean;
}

const allNavItems = [
  { icon: Compass,       label: 'Explore',         href: '/explore/articles',  flag: null },
  { icon: BookOpen,      label: 'Courses',         href: '/explore/courses',   flag: null },
  { icon: GraduationCap, label: 'Learning Paths',  href: '/explore/paths',     flag: 'learning_paths' as const },
];

export function PublicLayout({ children, hideSearch: _hideSearch = false }: PublicLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();
  const flags = useFeatureFlags();
  const [mobileOpen, setMobileOpen]       = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authTab, setAuthTab]             = useState<'login' | 'signup'>('login');
  const [searchModalOpen, setSearchModalOpen] = useState(false);

  const navItems = allNavItems.filter(item => item.flag === null || flags[item.flag]);

  const openAuth = (tab: 'login' | 'signup') => {
    setAuthTab(tab);
    setAuthModalOpen(true);
    setMobileOpen(false);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setSearchModalOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="flex flex-col h-screen w-full overflow-hidden">

      {/* ── Dark header — Logo | nav tabs | search trigger | auth ─────────── */}
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
              const active = item.href === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.href);
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

          {/* Search trigger & Auth — right side */}
          <div className="flex items-center gap-2 shrink-0 ml-auto">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchModalOpen(true)}
              className="hidden md:flex items-center gap-2 h-9 px-3 bg-sidebar-accent/40 border-sidebar-border/60 text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent text-xs rounded-xl transition-all"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search...</span>
              <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-sidebar-border bg-sidebar px-1.5 font-mono text-[10px] font-medium text-sidebar-foreground/50">
                <span className="text-xs">⌘</span>K
              </kbd>
            </Button>
            {isAuthenticated ? (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="gap-2 h-10 px-2 sm:px-3 text-sidebar-foreground hover:bg-sidebar-accent">
                    <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground text-sm font-semibold shrink-0 select-none">
                      {user?.name?.charAt(0).toUpperCase() || 'U'}
                    </div>
                    <span className="text-sm font-medium hidden sm:inline-block max-w-[120px] truncate">
                      {user?.name || 'User'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-sidebar-foreground/70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 bg-popover border z-50">
                  <div className="px-3 py-2 border-b border-border">
                    <p className="text-sm font-medium text-foreground truncate">{user?.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
                  </div>
                  <DropdownMenuItem className="cursor-pointer mt-1" onSelect={() => navigate('/dashboard')}>
                    <LayoutDashboard className="w-4 h-4 mr-2" />
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => navigate('/profile')}>
                    <UserIcon className="w-4 h-4 mr-2" />
                    Profile
                  </DropdownMenuItem>
                  <DropdownMenuItem className="cursor-pointer" onSelect={() => navigate('/account-settings')}>
                    <Settings className="w-4 h-4 mr-2" />
                    Account Settings
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive cursor-pointer" onSelect={logout}>
                    <LogOut className="w-4 h-4 mr-2" />
                    Sign Out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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
      <GlobalSearchModal open={searchModalOpen} onOpenChange={setSearchModalOpen} />
    </div>
  );
}
