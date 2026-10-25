import { describe, expect, it } from 'vitest';
import { validateProfile } from '@/lib/profileValidation';

const ok = { name: 'Asha', mobileNo: '+91 98765-43210', avatarUrl: 'https://cdn.example.com/a.png', bio: '', location: '', jobTitle: '' };

describe('validateProfile', () => {
  it('accepts valid values and empty optional fields', () => {
    expect(validateProfile(ok)).toEqual({});
    expect(validateProfile({ ...ok, mobileNo: '', avatarUrl: '/uploads/a.png' })).toEqual({});
  });

  it('rejects non-https avatars, bad phones and over-long fields', () => {
    const e = validateProfile({ ...ok, name: ' ', avatarUrl: 'http://x/a.png', mobileNo: 'abc', bio: 'x'.repeat(501), jobTitle: 'y'.repeat(121) });
    expect(Object.keys(e).sort()).toEqual(['avatarUrl', 'bio', 'jobTitle', 'mobileNo', 'name']);
    expect(validateProfile({ ...ok, avatarUrl: 'javascript:alert(1)' }).avatarUrl).toBeTruthy();
  });
});
