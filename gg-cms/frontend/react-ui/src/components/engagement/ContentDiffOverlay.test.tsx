import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ContentDiffOverlay, computeWordDiff } from './ContentDiffOverlay';

describe('computeWordDiff helper', () => {
  it('correctly marks added words with ins tag', () => {
    const diff = computeWordDiff('Hello world', 'Hello world today');
    expect(diff).toContain('<ins');
    expect(diff).toContain('today');
  });

  it('correctly marks deleted words with del tag', () => {
    const diff = computeWordDiff('Hello world today', 'Hello world');
    expect(diff).toContain('<del');
    expect(diff).toContain('today');
  });
});

describe('ContentDiffOverlay component', () => {
  it('renders null when hasPendingDraft is false', () => {
    const { container } = render(
      <ContentDiffOverlay
        publishedTitle="Old Title"
        draftTitle="New Title"
        publishedBody="Old Body"
        draftBody="New Body"
        status="DRAFT"
        hasPendingDraft={false}
        viewMode="diff"
        onViewModeChange={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders pending draft banner and legend when hasPendingDraft is true', () => {
    render(
      <ContentDiffOverlay
        publishedTitle="Old Title"
        draftTitle="New Title"
        publishedBody="Old Body"
        draftBody="New Body"
        status="REVIEW"
        hasPendingDraft={true}
        publishedVersion={1}
        version={2}
        viewMode="diff"
        onViewModeChange={vi.fn()}
      />
    );

    expect(screen.getByText(/Pending Draft \(REVIEW\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Version:/i)).toBeInTheDocument();
    expect(screen.getByText(/Added Content/i)).toBeInTheDocument();
    expect(screen.getByText(/Removed Content/i)).toBeInTheDocument();
  });

  it('triggers onViewModeChange when pill buttons are clicked', () => {
    const handleModeChange = vi.fn();
    render(
      <ContentDiffOverlay
        publishedTitle="Old Title"
        draftTitle="New Title"
        publishedBody="Old Body"
        draftBody="New Body"
        status="DRAFT"
        hasPendingDraft={true}
        viewMode="diff"
        onViewModeChange={handleModeChange}
      />
    );

    const draftBtn = screen.getByText(/Draft Preview/i);
    fireEvent.click(draftBtn);
    expect(handleModeChange).toHaveBeenCalledWith('draft');
  });
});
