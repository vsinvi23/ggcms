import { AppSidebar } from './AppSidebar';
import { Header } from './Header';
import { FloatingPersonalizationButton } from '@/components/personalization/FloatingPersonalizationButton';

interface DashboardLayoutProps {
  children: React.ReactNode;
}

export function DashboardLayout({ children }: DashboardLayoutProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden">
      <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:top-2 focus:left-2 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground">
        Skip to main content
      </a>
      <AppSidebar />
      <div className="flex flex-col flex-1 overflow-hidden">
        <Header />
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto bg-background p-6 focus:outline-none">
          {children}
        </main>
      </div>
      <FloatingPersonalizationButton />
    </div>
  );
}
