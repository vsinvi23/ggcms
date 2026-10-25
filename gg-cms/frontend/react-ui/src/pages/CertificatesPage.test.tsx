import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CertificatesPage from './CertificatesPage';
import VerifyCertificatePage from './VerifyCertificatePage';

const svc = vi.hoisted(() => ({ getMine: vi.fn(), downloadPdf: vi.fn(), verify: vi.fn() }));
vi.mock('@/api/services/certificateService', () => ({ certificateService: svc }));
vi.mock('@/components/layout/DashboardLayout', () => ({ DashboardLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));
vi.mock('@/components/layout/PublicLayout', () => ({ PublicLayout: ({ children }: { children: React.ReactNode }) => <div>{children}</div> }));

function wrap(ui: React.ReactElement, path = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const cert = {
  code: 'abc',
  courseId: 1,
  courseTitle: 'Go Basics',
  recipientName: 'Asha',
  score: 90,
  issuedAt: '2026-01-02T00:00:00Z',
  revoked: false,
  verifyUrl: 'https://x/certificates/verify/abc',
  pdfUrl: '/p',
  linkedInUrl: 'https://linkedin.com/add',
};

describe('CertificatesPage', () => {
  beforeEach(() => vi.clearAllMocks());

  it('shows the empty state', async () => {
    svc.getMine.mockResolvedValue([]);
    wrap(<CertificatesPage />);
    expect(await screen.findByText('No certificates yet')).toBeInTheDocument();
  });

  it('shows an error state with retry', async () => {
    svc.getMine.mockRejectedValue(new Error('x'));
    wrap(<CertificatesPage />);
    expect(await screen.findByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('renders certificate actions and a revoked badge without download or LinkedIn', async () => {
    svc.getMine.mockResolvedValue([cert, { ...cert, code: 'rev', courseTitle: 'Old', revoked: true }]);
    wrap(<CertificatesPage />);
    expect(await screen.findByText('Go Basics')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Download PDF/ })).toHaveLength(1);
    expect(screen.getAllByRole('link', { name: /Add to LinkedIn/ })).toHaveLength(1);
    expect(screen.getByText('Revoked')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Copy verification link/ })).toHaveLength(2);
  });
});

describe('VerifyCertificatePage', () => {
  beforeEach(() => vi.clearAllMocks());

  const renderVerify = () =>
    wrap(
      <Routes><Route path="/certificates/verify/:code" element={<VerifyCertificatePage />} /></Routes>,
      '/certificates/verify/abc',
    );

  it('shows recipient, course and date for a valid certificate and sets noindex', async () => {
    svc.verify.mockResolvedValue({ valid: true, recipientName: 'Asha', courseTitle: 'Go Basics', issuedAt: '2026-01-02T00:00:00Z', issuer: 'GeekGully' });
    renderVerify();
    expect(await screen.findByText('Valid certificate')).toBeInTheDocument();
    expect(screen.getByText('Asha')).toBeInTheDocument();
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute('content')).toContain('noindex');
  });

  it('shows a generic invalid state', async () => {
    svc.verify.mockResolvedValue({ valid: false });
    renderVerify();
    expect(await screen.findByText('Certificate not valid')).toBeInTheDocument();
  });
});
