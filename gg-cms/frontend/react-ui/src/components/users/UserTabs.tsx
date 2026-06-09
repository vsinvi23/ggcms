import { cn } from '@/lib/utils';
import { CheckCircle2, XCircle, UserPlus, Users } from 'lucide-react';

type TabStatus = 'all' | 'active' | 'deactivated' | 'invited';

interface StatusTab {
  id: TabStatus;
  label: string;
  count: number;
  icon: React.ElementType;
}

interface UserTabsProps {
  activeTab: TabStatus;
  onTabChange: (tab: TabStatus) => void;
  counts: {
    all: number;
    active: number;
    deactivated: number;
    invited: number;
  };
}

export function UserTabs({ activeTab, onTabChange, counts }: UserTabsProps) {
  const tabs: StatusTab[] = [
    { id: 'active', label: 'Active', count: counts.active, icon: CheckCircle2 },
    { id: 'deactivated', label: 'Deactivated', count: counts.deactivated, icon: XCircle },
    { id: 'invited', label: 'Invited', count: counts.invited, icon: UserPlus },
    { id: 'all', label: 'Total Users', count: counts.all, icon: Users },
  ];

  return (
    <div className="flex items-center gap-1 p-1 bg-muted rounded-lg">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;

        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all',
              isActive
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className={cn('w-4 h-4', isActive && tab.id === 'active' && 'text-success')} />
            <span>{tab.label}</span>
            <span
              className={cn(
                'ml-1 px-2 py-0.5 rounded-full text-xs',
                isActive ? 'bg-primary/10 text-primary' : 'bg-muted-foreground/20'
              )}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
