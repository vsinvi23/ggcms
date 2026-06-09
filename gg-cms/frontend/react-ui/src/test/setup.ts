import '@testing-library/jest-dom';
import { afterEach, beforeEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

// Suppress expected 404 console.error noise
const originalError = console.error;
beforeEach(() => {
  console.error = (...args: unknown[]) => {
    if (typeof args[0] === 'string' && args[0].includes('404 Error')) return;
    originalError(...args);
  };
});
afterEach(() => {
  console.error = originalError;
});
