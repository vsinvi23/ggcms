export interface StoredConsent {
  policyVersion: string;
  analytics: boolean;
  personalization: boolean;
  marketing: boolean;
  decidedAt: string;
}

const KEY = 'gg_consent';
export const CONSENT_EVENT = 'gg:consent-changed';
export const OPEN_PRIVACY_EVENT = 'gg:open-privacy-settings';

export const getStoredConsent = (): StoredConsent | null => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<StoredConsent>;
    if (typeof v.policyVersion !== 'string') return null;
    return {
      policyVersion: v.policyVersion,
      analytics: v.analytics === true,
      personalization: v.personalization === true,
      marketing: v.marketing === true,
      decidedAt: typeof v.decidedAt === 'string' ? v.decidedAt : '',
    };
  } catch {
    return null;
  }
};

export const storeConsent = (c: Omit<StoredConsent, 'decidedAt'>): void => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...c, decidedAt: new Date().toISOString() }));
  } catch {
    // storage unavailable: decision is not persisted
  }
  window.dispatchEvent(new Event(CONSENT_EVENT));
};

export const openPrivacySettings = (): void => {
  window.dispatchEvent(new Event(OPEN_PRIVACY_EVENT));
};
