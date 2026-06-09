/**
 * Normalise API errors to safe, user-facing messages.
 * Never expose raw server error text, stack traces, or internal paths to users.
 */
export const toUserMessage = (err: unknown, fallback = 'Something went wrong. Please try again.'): string => {
  const status = (err as { response?: { status?: number } })?.response?.status;
  if (status === 400) return 'Invalid request. Please check your input.';
  if (status === 401) return 'Invalid credentials or session expired.';
  if (status === 403) return 'You don\'t have permission to do that.';
  if (status === 404) return 'The requested resource was not found.';
  if (status === 409) return 'This already exists.';
  if (status === 429) return 'Too many requests. Please wait a moment and try again.';
  if (status && status >= 500) return 'Server error. Please try again later.';
  return fallback;
};
