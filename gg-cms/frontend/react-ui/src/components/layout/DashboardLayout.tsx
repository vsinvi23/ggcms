import { AppSidebar } from './AppSidebar';
import { Header } from './Header';
import { FloatingPersonalizationButton } from '@/components/personalization/FloatingPersonalizationButton';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <AppSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto bg-background p-6">
          {children}
        </main>
      </div>
      <FloatingPersonalizationButton />
    </div>
  );
}
