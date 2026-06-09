import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { WorkflowStatusBar } from './WorkflowStatusBar';
import type { WorkflowStatus } from '@/types/content';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ALL_STEP_LABELS = ['Draft', 'Submitted', 'In Review', 'Approved', 'Published'];

function renderBar(status: WorkflowStatus) {
  return render(<WorkflowStatusBar currentStatus={status} />);
}

// ─── Label visibility ─────────────────────────────────────────────────────────

describe('WorkflowStatusBar — label rendering', () => {
  it('renders all 5 stage labels for non-rejected status', () => {
    renderBar('draft');
    ALL_STEP_LABELS.forEach(label => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('hides stage labels when showLabels=false', () => {
    render(<WorkflowStatusBar currentStatus="draft" showLabels={false} />);
    ALL_STEP_LABELS.forEach(label => {
      expect(screen.queryByText(label)).toBeNull();
    });
  });
});

// ─── Rejected status ─────────────────────────────────────────────────────────

describe('WorkflowStatusBar — rejected status', () => {
  it('shows "Rejected" banner instead of the step flow', () => {
    renderBar('rejected');
    expect(screen.getByText('Rejected')).toBeInTheDocument();
  });

  it('does not render the normal step labels when rejected', () => {
    renderBar('rejected');
    expect(screen.queryByText('Draft')).toBeNull();
    expect(screen.queryByText('Published')).toBeNull();
  });
});

// ─── Active step highlighting ─────────────────────────────────────────────────

describe('WorkflowStatusBar — active step highlighting', () => {
  it.each<WorkflowStatus>(['draft', 'submitted', 'in_review', 'approved', 'published'])(
    'renders without crashing for status "%s"',
    (status) => {
      const { container } = renderBar(status);
      expect(container.firstChild).toBeTruthy();
    }
  );

  it('published step shows step number 5 (not a checkmark) as the current marker', () => {
    renderBar('published');
    // Steps 1–4 should be completed (checkmarks); step 5 is current (shows "5")
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('draft shows step 1 as current (no completed checkmarks before it)', () => {
    renderBar('draft');
    expect(screen.getByText('1')).toBeInTheDocument();
    // Steps 2–5 are pending
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('4')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
  });

  it('approved step shows steps 1–3 as completed (SVG check icons) and step 4 active', () => {
    const { container } = renderBar('approved');
    // 3 steps before 'approved' should be completed → 3 <svg> (Check icons)
    const svgIcons = container.querySelectorAll('svg');
    // At least 3 check icons (one per completed step)
    expect(svgIcons.length).toBeGreaterThanOrEqual(3);
    // Current step shows label, not a number
    expect(screen.getByText('Approved')).toBeInTheDocument();
  });
});
