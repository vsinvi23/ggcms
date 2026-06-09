import { cn } from '@/lib/utils';
import { NavLink } from '@/components/NavLink';
import { useLocation, Link } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Shield,
  Settings,
  Bell,
  Search,
  Globe,
  BarChart3,
  HelpCircle,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  UserCog,
} from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { useAuth } from '@/contexts/AuthContext';

interface NavItem {
  icon: React.ElementType;
  label: string;
  href: string;
  adminOnly?: boolean;
  contentOnly?: boolean; // For non-admin users with groups
}

interface NavSection {
  icon: React.ElementType;
  label: string;
  href: string;
  items: NavItem[];
  adminOnly?: boolean;
}

import { BookOpen, FileText, ListTodo, Layers, GraduationCap, Settings2, Upload } from 'lucide-react';

// All menu items with access control flags
const standaloneItems: NavItem[] = [
  { icon: LayoutDashboard, label: 'Dashboard', href: '/dashboard' }, // visible to all authenticated users
  { icon: ListTodo, label: 'My Tasks', href: '/my-tasks', contentOnly: true }, // users with groups
  { icon: BookOpen, label: 'Courses', href: '/courses', contentOnly: true },
  { icon: FileText, label: 'Articles', href: '/articles', contentOnly: true },
  { icon: GraduationCap, label: 'My Learning', href: '/my-learning', contentOnly: true },
  { icon: Upload, label: 'Bulk Import', href: '/import', contentOnly: true },
];

const userManagementSection: NavSection = {
  icon: UserCog,
  label: 'User Management',
  href: '/user-management',
  adminOnly: true,
  items: [
    { icon: Users, label: 'Manage Users', href: '/users', adminOnly: true },
    { icon: Shield, label: 'Roles & Permissions', href: '/roles', adminOnly: true },
    { icon: Globe, label: 'Content Overview', href: '/admin/content', adminOnly: true },
  ],
};

const settingsSection: NavSection = {
  icon: Settings,
  label: 'Settings',
  href: '/settings',
  adminOnly: true,
  items: [
    { icon: Globe, label: 'System Settings', href: '/settings', adminOnly: true },
    { icon: Settings2, label: 'Configuration', href: '/configuration', adminOnly: true },
  ],
};

const otherNavItems: NavItem[] = [
  { icon: BarChart3, label: 'Analytics', href: '/analytics', adminOnly: true },
];

const bottomNavItems: NavItem[] = [
  { icon: HelpCircle, label: 'Help', href: '/help' },
];

export function AppSidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { isAdmin, isAuthenticated } = useAuth();

  // isAdmin comes from JWT role or Admin group membership (set in AuthContext)
  // canSeeContentItems: any logged-in user can navigate to content pages
  const canSeeAdminItems = isAdmin;
  const canSeeContentItems = isAuthenticated;

  // Filter items based on permissions
  const visibleStandaloneItems = standaloneItems.filter(item => {
    if (item.adminOnly) return canSeeAdminItems;
    if (item.contentOnly) return canSeeContentItems;
    return true;
  });

  // Check if current route is within user management section
  const isUserManagementActive = 
    location.pathname === userManagementSection.href ||
    userManagementSection.items.some(item => location.pathname === item.href);
  
  // Check if current route is within settings section
  const isSettingsActive = 
    location.pathname === settingsSection.href ||
    settingsSection.items.some(item => location.pathname === item.href);
  
  const [userMgmtOpen, setUserMgmtOpen] = useState(isUserManagementActive);
  const [settingsOpen, setSettingsOpen] = useState(isSettingsActive);

  const renderNavItem = (item: NavItem, isNested: boolean = false) => (
    <Tooltip key={item.href} delayDuration={0}>
      <TooltipTrigger asChild>
        <NavLink
          to={item.href}
          className={cn(
            'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
            isNested && !collapsed && 'ml-4'
          )}
          activeClassName="bg-sidebar-accent text-sidebar-foreground"
        >
          <item.icon className="w-5 h-5 flex-shrink-0" />
          {!collapsed && (
            <span className="text-sm font-medium animate-fade-in">
              {item.label}
            </span>
          )}
        </NavLink>
      </TooltipTrigger>
      {collapsed && (
        <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground">
          {item.label}
        </TooltipContent>
      )}
    </Tooltip>
  );

  const renderSection = (
    section: NavSection,
    isActive: boolean,
    isOpen: boolean,
    setIsOpen: (open: boolean) => void
  ) => {
    // Check if section should be visible
    if (section.adminOnly && !canSeeAdminItems) return null;

    return (
      <li>
        {collapsed ? (
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <Link
                to={section.href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
                  isActive && 'bg-sidebar-accent text-sidebar-foreground'
                )}
              >
                <section.icon className="w-5 h-5 flex-shrink-0" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" className="bg-sidebar text-sidebar-foreground">
              {section.label}
            </TooltipContent>
          </Tooltip>
        ) : (
          <Collapsible open={isOpen} onOpenChange={setIsOpen}>
            <CollapsibleTrigger asChild>
              <button
                className={cn(
                  'w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent transition-colors',
                  isActive && 'text-sidebar-foreground bg-sidebar-accent'
                )}
              >
                <div className="flex items-center gap-3">
                  <section.icon className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm font-medium">{section.label}</span>
                </div>
                <ChevronDown
                  className={cn(
                    'w-4 h-4 transition-transform duration-200',
                    isOpen && 'rotate-180'
                  )}
                />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-1 space-y-1">
              {section.items.map((item) => renderNavItem(item, true))}
            </CollapsibleContent>
          </Collapsible>
        )}
      </li>
    );
  };

  return (
    <aside
      className={cn(
        'flex flex-col bg-sidebar h-screen transition-all duration-300 border-r border-sidebar-border',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Logo */}
      <Link to="/" className="flex items-center h-16 px-4 border-b border-sidebar-border hover:bg-sidebar-accent/50 transition-colors">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-primary/60 flex items-center justify-center shadow-lg">
            <span className="text-sidebar-primary-foreground font-bold text-sm">GG</span>
          </div>
          {!collapsed && (
            <span className="font-semibold text-sidebar-foreground animate-fade-in">
              GeekGully
            </span>
          )}
        </div>
      </Link>

      {/* Navigation */}
      <nav className="flex-1 py-4 overflow-y-auto scrollbar-thin">
        <ul className="space-y-1 px-2">
          {/* Filtered standalone items */}
          {visibleStandaloneItems.map((item) => (
            <li key={item.href}>{renderNavItem(item)}</li>
          ))}

          {/* User Management Section - Admin only */}
          {renderSection(userManagementSection, isUserManagementActive, userMgmtOpen, setUserMgmtOpen)}

          {/* Settings Section - Admin only */}
          {renderSection(settingsSection, isSettingsActive, settingsOpen, setSettingsOpen)}

          {/* Other nav items - filtered */}
          {otherNavItems
            .filter(item => !item.adminOnly || canSeeAdminItems)
            .map((item) => (
              <li key={item.href}>{renderNavItem(item)}</li>
            ))}
        </ul>
      </nav>

      {/* Bottom Navigation */}
      <div className="border-t border-sidebar-border py-4 px-2">
        <ul className="space-y-1">
          {bottomNavItems.map((item) => (
            <li key={item.href}>{renderNavItem(item)}</li>
          ))}
        </ul>
      </div>

      {/* Collapse Toggle */}
      <div className="p-2 border-t border-sidebar-border">
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-center text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-accent"
          onClick={() => setCollapsed(!collapsed)}
        >
          {collapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4 mr-2" />
              <span className="text-sm">Collapse</span>
            </>
          )}
        </Button>
      </div>
    </aside>
  );
}
