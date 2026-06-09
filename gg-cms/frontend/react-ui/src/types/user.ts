export type UserRole = 'Admin' | 'Viewer' | 'Editor' | 'Moderator';

export type UserStatus = 'active' | 'deactivated' | 'invited';

export interface User {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  createdAt: string;
  lastLogin?: string;
  avatar?: string;
}

export interface UserFilters {
  status: UserStatus | 'all';
  search: string;
  sortBy: keyof User;
  sortOrder: 'asc' | 'desc';
}

export interface PaginationState {
  currentPage: number;
  pageSize: number;
  totalItems: number;
}

export interface Permission {
  id: string;
  name: string;
  description: string;
  module: string;
}

export interface Role {
  id: string;
  name: UserRole;
  description: string;
  permissions: string[];
  userCount: number;
}
