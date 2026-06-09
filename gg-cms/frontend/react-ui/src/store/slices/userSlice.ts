import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { User, UserFilters, PaginationState, UserStatus } from '@/types/user';
import { mockUsers } from '@/data/mockUsers';

interface UserState {
  users: User[];
  filteredUsers: User[];
  filters: UserFilters;
  pagination: PaginationState;
  loading: boolean;
  error: string | null;
  selectedUser: User | null;
}

const initialState: UserState = {
  users: mockUsers,
  filteredUsers: mockUsers,
  filters: {
    status: 'all',
    search: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
  },
  pagination: {
    currentPage: 1,
    pageSize: 10,
    totalItems: mockUsers.length,
  },
  loading: false,
  error: null,
  selectedUser: null,
};

const applyFilters = (users: User[], filters: UserFilters): User[] => {
  let result = [...users];

  // Filter by status
  if (filters.status !== 'all') {
    result = result.filter((user) => user.status === filters.status);
  }

  // Filter by search
  if (filters.search) {
    const searchLower = filters.search.toLowerCase();
    result = result.filter(
      (user) =>
        user.firstName.toLowerCase().includes(searchLower) ||
        user.lastName.toLowerCase().includes(searchLower) ||
        user.email.toLowerCase().includes(searchLower)
    );
  }

  // Sort
  result.sort((a, b) => {
    const aValue = a[filters.sortBy];
    const bValue = b[filters.sortBy];

    if (typeof aValue === 'string' && typeof bValue === 'string') {
      return filters.sortOrder === 'asc'
        ? aValue.localeCompare(bValue)
        : bValue.localeCompare(aValue);
    }
    return 0;
  });

  return result;
};

const userSlice = createSlice({
  name: 'users',
  initialState,
  reducers: {
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.loading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<UserFilters>>) => {
      state.filters = { ...state.filters, ...action.payload };
      state.filteredUsers = applyFilters(state.users, state.filters);
      state.pagination.totalItems = state.filteredUsers.length;
      state.pagination.currentPage = 1;
    },
    setPage: (state, action: PayloadAction<number>) => {
      state.pagination.currentPage = action.payload;
    },
    setPageSize: (state, action: PayloadAction<number>) => {
      state.pagination.pageSize = action.payload;
      state.pagination.currentPage = 1;
    },
    toggleUserStatus: (state, action: PayloadAction<string>) => {
      const user = state.users.find((u) => u.id === action.payload);
      if (user) {
        user.status = user.status === 'active' ? 'deactivated' : 'active';
        state.filteredUsers = applyFilters(state.users, state.filters);
        state.pagination.totalItems = state.filteredUsers.length;
      }
    },
    addUser: (state, action: PayloadAction<User>) => {
      state.users.unshift(action.payload);
      state.filteredUsers = applyFilters(state.users, state.filters);
      state.pagination.totalItems = state.filteredUsers.length;
    },
    updateUser: (state, action: PayloadAction<User>) => {
      const index = state.users.findIndex((u) => u.id === action.payload.id);
      if (index !== -1) {
        state.users[index] = action.payload;
        state.filteredUsers = applyFilters(state.users, state.filters);
      }
    },
    deleteUser: (state, action: PayloadAction<string>) => {
      state.users = state.users.filter((u) => u.id !== action.payload);
      state.filteredUsers = applyFilters(state.users, state.filters);
      state.pagination.totalItems = state.filteredUsers.length;
    },
    setSelectedUser: (state, action: PayloadAction<User | null>) => {
      state.selectedUser = action.payload;
    },
  },
});

export const {
  setLoading,
  setError,
  setFilters,
  setPage,
  setPageSize,
  toggleUserStatus,
  addUser,
  updateUser,
  deleteUser,
  setSelectedUser,
} = userSlice.actions;

export default userSlice.reducer;
