export const transformUser = (u: any) => {
  if (!u) return null;
  return {
    id: u.id,
    name: u.name || u.username,
    email: u.email,
    username: u.username,
    role: u.role?.name || u.roleType || 'User',
    roleType: u.roleType || 'user',
    status: u.status || (u.blocked ? 'deactivated' : 'active'),
    groups: u.groups?.map((g: any) => g.name || g) || [],
    groupIds: u.groupIds || u.groups?.map((g: any) => g.id).filter(Boolean) || [],
    mobileNo: u.mobileNo || u.phone || '',
    blocked: u.blocked || false,
    confirmed: u.confirmed !== false,
    lastLogin: u.lastLogin || null,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
};

export const transformGroup = (g: any) => {
  if (!g) return null;
  const members = g.members?.data?.map(transformUser) || g.users || g.members || [];
  return {
    id: g.id,
    name: g.name,
    role: g.role || 'viewer',
    permissions: g.permissions || {},
    description: g.description,
    members,
    users: members,
    memberCount: members.length,
    createdAt: g.createdAt,
    updatedAt: g.updatedAt,
  };
};

export const transformCategory = (c: any) => {
  if (!c) return null;
  return {
    id: c.id,
    name: c.name,
    slug: c.slug,
    description: c.description,
    parentId: c.parent?.id || c.parentId || null,
    isVirtual: c.isVirtual ?? false,
    requiredApprovals: c.requiredApprovals ?? 1,
    children: c.children?.map(transformCategory) || [],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
};
