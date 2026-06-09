type RawRecord = Record<string, unknown>;

export const transformUser = (u: RawRecord) => {
  if (!u) return null;
  const role = u.role as RawRecord | undefined;
  return {
    id: u.id,
    name: u.name || u.username,
    email: u.email,
    username: u.username,
    role: role?.name || u.roleType || 'User',
    roleType: u.roleType || 'user',
    status: u.status || (u.blocked ? 'deactivated' : 'active'),
    groups: (u.groups as RawRecord[] | undefined)?.map((g) => g.name || g) || [],
    groupIds: u.groupIds || (u.groups as RawRecord[] | undefined)?.map((g) => g.id).filter(Boolean) || [],
    mobileNo: u.mobileNo || u.phone || '',
    blocked: u.blocked || false,
    confirmed: u.confirmed !== false,
    lastLogin: u.lastLogin || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
};

export const transformGroup = (g: RawRecord) => {
  if (!g) return null;
  const membersData = g.members as RawRecord | undefined;
  const members = (membersData?.data as RawRecord[] | undefined)?.map(transformUser) || g.users || g.members || [];
  return {
    id: g.id,
    name: g.name,
    role: g.role || 'viewer',
    permissions: g.permissions || {},
    description: g.description,
    members,
    users: members,
    memberCount: (members as unknown[]).length,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
};

export const transformCategory = (c: RawRecord) => {
  if (!c) return null;
  const parent = c.parent as RawRecord | undefined;
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    parentId: parent?.id || c.parentId || null,
    isVirtual: c.isVirtual ?? false,
    requiredApprovals: c.requiredApprovals ?? 1,
    children: (c.children as RawRecord[] | undefined)?.map(transformCategory) || [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
};
