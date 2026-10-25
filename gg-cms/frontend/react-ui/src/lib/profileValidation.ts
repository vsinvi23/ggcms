export interface ProfileFormValues {
  name: string;
  mobileNo: string;
  avatarUrl: string;
  bio: string;
  location: string;
  jobTitle: string;
}

export type ProfileFormErrors = Partial<Record<keyof ProfileFormValues, string>>;

export const validateProfile = (v: ProfileFormValues): ProfileFormErrors => {
  const e: ProfileFormErrors = {};
  const name = v.name.trim();
  if (name.length < 1 || name.length > 100) e.name = 'Name must be 1-100 characters.';
  if (v.mobileNo && !/^\+?[0-9 ()-]{3,30}$/.test(v.mobileNo)) e.mobileNo = 'Use digits, spaces, ( ) - and an optional leading +.';
  if (v.avatarUrl) {
    if (v.avatarUrl.length > 1024) e.avatarUrl = 'Avatar URL is too long.';
    else if (!v.avatarUrl.startsWith('https://') && !v.avatarUrl.startsWith('/uploads/')) e.avatarUrl = 'Avatar must be an https:// URL.';
  }
  if (v.bio.length > 500) e.bio = 'Bio must be at most 500 characters.';
  if (v.location.length > 120) e.location = 'Location must be at most 120 characters.';
  if (v.jobTitle.length > 120) e.jobTitle = 'Job title must be at most 120 characters.';
  return e;
};
