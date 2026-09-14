import { describe, it, expect } from 'vitest';
import { toUserMessage } from './errors';

describe('toUserMessage error formatting', () => {
  it('extracts data.message from backend API response', () => {
    const err = { response: { status: 400, data: { message: 'invalid upload payload: no files provided' } } };
    expect(toUserMessage(err)).toBe('invalid upload payload: no files provided');
  });

  it('extracts data.error if data.message is absent', () => {
    const err = { response: { status: 400, data: { error: 'Wrong format: invalid zip archive' } } };
    expect(toUserMessage(err)).toBe('Wrong format: invalid zip archive');
  });

  it('handles raw string data response', () => {
    const err = { response: { status: 400, data: 'Custom raw error message' } };
    expect(toUserMessage(err)).toBe('Custom raw error message');
  });

  it('falls back to status code message when response data is empty', () => {
    const err = { response: { status: 400 } };
    expect(toUserMessage(err)).toBe('Invalid request. Please check your input.');
  });

  it('uses custom fallback when error object has no status', () => {
    const err = new Error('Network Failure');
    expect(toUserMessage(err, 'Failed to parse content')).toBe('Failed to parse content');
  });
});
