type RawRecord = Record<string, unknown>;

export const transformUser = (u: RawRecord) => {
  if (!u) return null;
  const role = u.role as RawRecord | undefined;
  return {
    id: u.id as number,
    name: (u.name as string | undefined) || (u.username as string | undefined),
    email: u.email as string,
    username: u.username as string | undefined,
    role: (role?.name as string | undefined) || (u.roleType as string | undefined) || 'User',
    roleType: (u.roleType as string | undefined) || 'user',
    status: (u.status as string | undefined) || (u.blocked ? 'deactivated' : 'active'),
    groups: (u.groups as RawRecord[] | undefined)?.map((g) => (g.name as string | undefined) || String(g)) || [],
    groupIds: (u.groupIds as number[] | undefined) || (u.groups as RawRecord[] | undefined)?.map((g) => g.id as number).filter(Boolean) || [],
    mobileNo: (u.mobileNo as string | undefined) || (u.phone as string | undefined) || '',
    blocked: (u.blocked as boolean | undefined) || false,
    confirmed: u.confirmed !== false,
    lastLogin: (u.lastLogin as string | null | undefined) || null,
    createdAt: u.createdAt as string,
    updatedAt: u.updatedAt as string | undefined,
  };
};

export const transformGroup = (g: RawRecord) => {
  if (!g) return null;
  const membersData = g.members as RawRecord | undefined;
  const members = ((membersData?.data as RawRecord[] | undefined)?.map(transformUser) ||
    (g.users as RawRecord[] | undefined) ||
    (g.members as RawRecord[] | undefined) ||
    []) as ReturnType<typeof transformUser>[];
  return {
    id: g.id as number,
    name: g.name as string,
    role: (g.role as string | undefined) || 'viewer',
    permissions: g.permissions || {},
    description: g.description as string | undefined,
    members,
    users: members,
    memberCount: members.length,
    createdAt: g.createdAt as string | undefined,
    updatedAt: g.updatedAt as string | undefined,
  };
};

export const transformCategory = (c: RawRecord) => {
  if (!c) return null;
  const parent = c.parent as RawRecord | undefined;
  return {
    id: c.id as number,
    name: c.name as string,
    slug: c.slug as string | undefined,
    description: c.description as string | undefined,
    parentId: (parent?.id as number | undefined) ?? (c.parentId as number | undefined) ?? null,
    isVirtual: (c.isVirtual as boolean | undefined) ?? false,
    requiredApprovals: (c.requiredApprovals as number | undefined) ?? 1,
    children: (c.children as RawRecord[] | undefined)?.map(transformCategory) || [],
    createdAt: c.createdAt as string | undefined,
    updatedAt: c.updatedAt as string | undefined,
  };
};
