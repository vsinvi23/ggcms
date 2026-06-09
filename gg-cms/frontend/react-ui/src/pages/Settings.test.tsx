import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { vi } from 'vitest';
import SettingsPage from './Settings';

// Mock the DashboardLayout
vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// Mock useSettings hook
const mockUpdate = vi.fn().mockResolvedValue(undefined);
const mockTestStorage = vi.fn();
vi.mock('@/api/hooks/useSettings', () => ({
  useSettings: () => ({
    settings: {
      'storage.provider': 'local',
      'storage.local.upload_dir': './uploads',
      'storage.local.base_url': 'http://localhost:8080/uploads',
      'storage.s3.bucket': '',
      'storage.s3.region': 'us-east-1',
      'storage.s3.access_key': '',
      'storage.s3.secret_key': '',
      'storage.s3.endpoint': '',
      'storage.s3.public_url': '',
      'upload.max_size_mb': '10',
      'upload.allowed_types': 'image/jpeg,image/png',
    },
    isLoading: false,
    update: mockUpdate,
    isSaving: false,
    testStorage: mockTestStorage,
    isTesting: false,
  }),
}));

// Mock config
vi.mock('@/config/api', () => ({
  API_BASE_URL: 'http://localhost:8080/api',
  APP_NAME: 'TestApp',
  ADMIN_GROUP_NAME: 'Admin',
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}

describe('SettingsPage — Storage tab', () => {
  it('renders the Storage tab trigger', () => {
    render(<SettingsPage />, { wrapper });
    expect(screen.getByText('Storage')).toBeInTheDocument();
  });

  it('shows local storage fields when local provider is selected', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />, { wrapper });
    await user.click(screen.getByRole('tab', { name: /Storage/i }));
    await waitFor(() => {
      expect(screen.getByText('Local Storage')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('./uploads')).toBeInTheDocument();
    });
  });

  it('shows S3 fields when S3 provider is selected', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />, { wrapper });
    await user.click(screen.getByRole('tab', { name: /Storage/i }));
    await waitFor(() => screen.getByText('Storage Backend'));
    await user.click(screen.getByRole('combobox'));
    await user.click(screen.getByText(/S3-Compatible/));
    await waitFor(() => {
      expect(screen.getByPlaceholderText('my-uploads-bucket')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('us-east-1')).toBeInTheDocument();
    });
  });

  it('calls update when Save Storage Settings is clicked', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />, { wrapper });
    await user.click(screen.getByRole('tab', { name: /Storage/i }));
    await waitFor(() => screen.getByText('Save Storage Settings'));
    fireEvent.click(screen.getByText('Save Storage Settings'));
    await waitFor(() => {
      expect(mockUpdate).toHaveBeenCalled();
    });
  });
});
