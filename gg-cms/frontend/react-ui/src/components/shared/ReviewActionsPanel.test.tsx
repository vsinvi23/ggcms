import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ReviewActionsPanel } from './ReviewActionsPanel';
import type { WorkflowStatus } from '@/types/content';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function renderPanel(status: WorkflowStatus, onAction = vi.fn()) {
  return render(<ReviewActionsPanel currentStatus={status} onAction={onAction} />);
}

// ─── Status → available actions ───────────────────────────────────────────────

describe('ReviewActionsPanel — available actions by status', () => {
  it('draft: shows only "Submit for Review"', () => {
    renderPanel('draft');
    expect(screen.getByRole('button', { name: /Submit for Review/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Reject/i })).toBeNull();
  });

  it('submitted: shows Approve, Request Changes, Reject', () => {
    renderPanel('submitted');
    expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request Changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
  });

  it('in_review: shows Approve, Request Changes, Reject', () => {
    renderPanel('in_review');
    expect(screen.getByRole('button', { name: /Approve/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Request Changes/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Reject/i })).toBeInTheDocument();
  });

  it('approved: shows Publish and Send Back', () => {
    renderPanel('approved');
    expect(screen.getByRole('button', { name: /Publish/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Send Back/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve/i })).toBeNull();
  });

  it('published: shows only Unpublish', () => {
    renderPanel('published');
    expect(screen.getByRole('button', { name: /Unpublish/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Publish$/i })).toBeNull();
  });

  it('rejected: shows only Resubmit', () => {
    renderPanel('rejected');
    expect(screen.getByRole('button', { name: /Resubmit/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Approve/i })).toBeNull();
  });

  it('returns null for unknown status', () => {
    const { container } = renderPanel('unknown' as WorkflowStatus);
    expect(container.firstChild).toBeNull();
  });
});

// ─── Direct actions (no dialog) ───────────────────────────────────────────────

describe('ReviewActionsPanel — direct actions call onAction immediately', () => {
  it('Approve calls onAction("approve") without dialog', () => {
    const onAction = vi.fn();
    renderPanel('in_review', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Approve/i }));
    expect(onAction).toHaveBeenCalledWith('approve');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Publish calls onAction("publish") without dialog', () => {
    const onAction = vi.fn();
    renderPanel('approved', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Publish/i }));
    expect(onAction).toHaveBeenCalledWith('publish');
  });

  it('Submit for Review calls onAction("submit") without dialog', () => {
    const onAction = vi.fn();
    renderPanel('draft', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Submit for Review/i }));
    expect(onAction).toHaveBeenCalledWith('submit');
  });

  it('Resubmit calls onAction("submit") without dialog', () => {
    const onAction = vi.fn();
    renderPanel('rejected', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Resubmit/i }));
    expect(onAction).toHaveBeenCalledWith('submit');
  });

  it('Unpublish calls onAction("unpublish") without dialog', () => {
    const onAction = vi.fn();
    renderPanel('published', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Unpublish/i }));
    expect(onAction).toHaveBeenCalledWith('unpublish');
  });
});

// ─── Reject flow — dialog + required comment ─────────────────────────────────

describe('ReviewActionsPanel — Reject opens dialog and requires comment', () => {
  it('clicking Reject opens the dialog', () => {
    renderPanel('in_review');
    fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText(/Reject Content/i)).toBeInTheDocument();
  });

  it('Confirm button is disabled while comment is empty', () => {
    renderPanel('in_review');
    fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
    const confirmBtn = screen.getByRole('button', { name: /Confirm/i });
    expect(confirmBtn).toBeDisabled();
  });

  it('Confirm button enables after entering a comment', async () => {
    renderPanel('in_review');
    fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
    fireEvent.change(screen.getByPlaceholderText(/Enter your comments/i), {
      target: { value: 'Content needs major revision' },
    });
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Confirm/i })).not.toBeDisabled();
    });
  });

  it('confirming reject calls onAction("reject", comment)', async () => {
    const onAction = vi.fn();
    renderPanel('in_review', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
    fireEvent.change(screen.getByPlaceholderText(/Enter your comments/i), {
      target: { value: 'Off-topic content' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onAction).toHaveBeenCalledWith('reject', 'Off-topic content');
  });

  it('Cancel closes the dialog without calling onAction', () => {
    const onAction = vi.fn();
    renderPanel('in_review', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Reject/i }));
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }));
    expect(onAction).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

// ─── Request Changes flow ─────────────────────────────────────────────────────

describe('ReviewActionsPanel — Request Changes opens dialog', () => {
  it('clicking Request Changes opens the dialog with correct title', () => {
    renderPanel('in_review');
    fireEvent.click(screen.getByRole('button', { name: /Request Changes/i }));
    expect(screen.getByRole('heading', { name: /Request Changes/i })).toBeInTheDocument();
  });

  it('Confirm disabled while comment is empty', () => {
    renderPanel('in_review');
    fireEvent.click(screen.getByRole('button', { name: /Request Changes/i }));
    expect(screen.getByRole('button', { name: /Confirm/i })).toBeDisabled();
  });

  it('confirming with comment calls onAction("request_changes", comment)', () => {
    const onAction = vi.fn();
    renderPanel('in_review', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Request Changes/i }));
    fireEvent.change(screen.getByPlaceholderText(/Enter your comments/i), {
      target: { value: 'Fix formatting in section 2' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onAction).toHaveBeenCalledWith('request_changes', 'Fix formatting in section 2');
  });
});

// ─── Send Back (from approved) ────────────────────────────────────────────────

describe('ReviewActionsPanel — Send Back from approved state', () => {
  it('Send Back opens dialog', () => {
    renderPanel('approved');
    fireEvent.click(screen.getByRole('button', { name: /Send Back/i }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('Confirm disabled without comment', () => {
    renderPanel('approved');
    fireEvent.click(screen.getByRole('button', { name: /Send Back/i }));
    expect(screen.getByRole('button', { name: /Confirm/i })).toBeDisabled();
  });

  it('confirming calls onAction("request_changes", comment)', () => {
    const onAction = vi.fn();
    renderPanel('approved', onAction);
    fireEvent.click(screen.getByRole('button', { name: /Send Back/i }));
    fireEvent.change(screen.getByPlaceholderText(/Enter your comments/i), {
      target: { value: 'Needs SEO tags added' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Confirm/i }));
    expect(onAction).toHaveBeenCalledWith('request_changes', 'Needs SEO tags added');
  });
});

// ─── Loading state ────────────────────────────────────────────────────────────

describe('ReviewActionsPanel — loading state', () => {
  it('all buttons are disabled when isLoading=true', () => {
    render(<ReviewActionsPanel currentStatus="in_review" onAction={vi.fn()} isLoading />);
    screen.getAllByRole('button').forEach(btn => {
      expect(btn).toBeDisabled();
    });
  });
});
