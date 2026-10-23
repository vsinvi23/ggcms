import { useEffect, useState } from 'react';
import { authService, type AuthProviderInfo } from '@/api/services/authService';

let cached: Promise<AuthProviderInfo[]> | null = null;

const loadProviders = (): Promise<AuthProviderInfo[]> => {
  if (!cached) {
    cached = authService.getProviders().catch(() => {
      cached = null;
      return [] as AuthProviderInfo[];
    });
  }
  return cached;
};

/** Enabled social providers as reported by GET /api/auth/providers. */
export const useAuthProviders = (): AuthProviderInfo[] => {
  const [providers, setProviders] = useState<AuthProviderInfo[]>([]);

  useEffect(() => {
    let active = true;
    loadProviders().then((list) => {
      if (active) setProviders(list);
    });
    return () => {
      active = false;
    };
  }, []);

  return providers;
};
