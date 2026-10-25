import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { engagementFixture } from '@/test/fixtures/analytics';

const engagement = vi.fn();
vi.mock('@/api/hooks/useAnalytics', () => ({
  useUserEngagement: () => engagement(),
  useAnalyticsOverview: vi.fn(),
  useAnalyticsContent: vi.fn(),
  useAnalyticsSearch: vi.fn(),
  useAnalyticsFunnel: vi.fn(),
  useAnalyticsCohorts: vi.fn(),
  useAnalyticsRecommendations: vi.fn(),
}));

import { EngagementTab } from './AnalyticsTabs';
import { toCsv, rangeFromDays, isValidRange } from '@/lib/analyticsHelpers';

describe('EngagementTab', () => {
  it('renders the table with the formula explanation', () => {
    engagement.mockReturnValue({
      data: { items: engagementFixture, total: 2, currentPage: 0, pageSize: 20 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<EngagementTab />);
    expect(screen.getByRole('table', { name: /engagement score/i })).toBeInTheDocument();
    expect(screen.getByText('Asha Rao')).toBeInTheDocument();
    expect(screen.getByText('high (at risk)')).toBeInTheDocument();
    expect(screen.getByText(/40 x min\(active days/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export user engagement as csv/i })).toBeEnabled();
  });

  it('shows an error state', () => {
    engagement.mockReturnValue({ data: undefined, isLoading: false, isError: true, refetch: vi.fn() });
    render(<EngagementTab />);
    expect(screen.getByRole('alert')).toHaveTextContent('Could not load this report');
  });

  it('shows an empty state', () => {
    engagement.mockReturnValue({
      data: { items: [], total: 0, currentPage: 0, pageSize: 20 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    });
    render(<EngagementTab />);
    expect(screen.getByText('No users yet.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export user engagement as csv/i })).toBeDisabled();
  });
});

describe('CSV and range helpers', () => {
  it('escapes quotes and neutralises spreadsheet formulas', () => {
    const csv = toCsv(
      [{ header: 'Name', cell: (r: { n: string }) => r.n }],
      [{ n: '=SUM(A1)' }, { n: 'a "b", c' }],
    );
    expect(csv.split('\n')).toEqual(['Name', "'=SUM(A1)", '"a ""b"", c"']);
  });

  it('builds a valid 30 day range', () => {
    const r = rangeFromDays(30, new Date('2026-10-22T12:00:00Z'));
    expect(r).toEqual({ from: '2026-09-23', to: '2026-10-22' });
    expect(isValidRange(r)).toBe(true);
    expect(isValidRange({ from: '2024-01-01', to: '2026-01-01' })).toBe(false);
  });
});
