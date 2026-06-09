import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge', () => {
  it.each([
    ['DRAFT', 'Draft'],
    ['REVIEW', 'In Review'],
    ['IN_REVIEW', 'In Review'],
    ['APPROVED', 'Approved'],
    ['PUBLISHED', 'Published'],
    ['REJECTED', 'Rejected'],
    ['SUBMITTED', 'Submitted'],
  ])('renders label "%s" → "%s"', (status, label) => {
    render(<StatusBadge status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('renders lowercase variants correctly', () => {
    render(<StatusBadge status="draft" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('falls back to Draft for unknown status', () => {
    render(<StatusBadge status="UNKNOWN_STATUS" />);
    expect(screen.getByText('Draft')).toBeInTheDocument();
  });

  it('hides icon when showIcon=false', () => {
    const { container } = render(<StatusBadge status="PUBLISHED" showIcon={false} />);
    expect(container.querySelector('svg')).toBeNull();
  });

  it('shows icon by default', () => {
    const { container } = render(<StatusBadge status="PUBLISHED" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders pending-draft chip when hasPendingDraft=true', () => {
    render(<StatusBadge status="APPROVED" hasPendingDraft publishedVersion={2} />);
    expect(screen.getByText(/Live v2 · Revision pending/)).toBeInTheDocument();
  });

  it('renders pending-draft chip without version number', () => {
    render(<StatusBadge status="APPROVED" hasPendingDraft />);
    expect(screen.getByText(/Revision pending/)).toBeInTheDocument();
  });

  it('does not render pending-draft chip when hasPendingDraft=false', () => {
    render(<StatusBadge status="APPROVED" hasPendingDraft={false} />);
    expect(screen.queryByText(/Revision pending/)).toBeNull();
  });

  it('applies custom className', () => {
    const { container } = render(<StatusBadge status="DRAFT" className="custom-class" />);
    expect(container.querySelector('.custom-class')).toBeInTheDocument();
  });
});
