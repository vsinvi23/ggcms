export const OAUTH_ERROR_MESSAGES: Record<string, string> = {
  access_denied: 'You declined the sign-in request.',
  invalid_state: 'Your sign-in session expired or was interrupted. Please try again.',
  provider_error: 'The provider could not complete sign-in. Please try again.',
  email_unverified: 'Your email address at that provider is not verified. Verify it there, then try again.',
  email_missing: 'The provider did not share an email address with us.',
  account_disabled: 'This account is disabled. Contact support if you think this is a mistake.',
  link_required: 'An account with this email already exists. Confirm it is you to continue.',
  identity_already_linked: 'That account is already linked to a different user.',
  provider_disabled: 'This sign-in method is not available right now.',
  rate_limited: 'Too many attempts. Please wait a moment and try again.',
  server_error: 'Something went wrong on our side. Please try again.',
};

const GENERIC = 'Sign-in failed. Please try again.';

export const oauthErrorMessage = (code: string | null | undefined): string =>
  (code && OAUTH_ERROR_MESSAGES[code]) || GENERIC;

export const safeRedirectPath = (path: string | null | undefined, fallback = '/dashboard'): string => {
  if (!path || !path.startsWith('/') || path.startsWith('//') || path.includes(String.fromCharCode(92))) return fallback;
  if (path === '/') return fallback;
  return path;
};

export const PROVIDER_LABELS: Record<string, string> = {
  google: 'Google',
  github: 'GitHub',
  linkedin: 'LinkedIn',
};
