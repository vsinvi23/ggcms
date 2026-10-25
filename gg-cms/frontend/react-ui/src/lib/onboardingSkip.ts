const skipKey = (userId: number) => `gg_onboarding_skipped_${userId}`;

export const isOnboardingSkipped = (userId: number): boolean => {
  try {
    return localStorage.getItem(skipKey(userId)) === '1';
  } catch {
    return false;
  }
};

export const markOnboardingSkipped = (userId: number): void => {
  try {
    localStorage.setItem(skipKey(userId), '1');
  } catch {
    return;
  }
};
