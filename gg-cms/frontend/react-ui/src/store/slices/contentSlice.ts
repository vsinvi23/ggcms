import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Category, CategorySettings } from '@/types/content';
import { mockCategories } from '@/data/mockContent';

interface ContentState {
  categories: Category[];
  selectedCategoryId: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: ContentState = {
  categories: mockCategories,
  selectedCategoryId: null,
  loading: false,
  error: null,
};

export const fetchCategories = createAsyncThunk(
  'content/fetchCategories',
  async () => {
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 500));
    return mockCategories;
  }
);

const findAndUpdateCategory = (
  categories: Category[],
  id: string,
  updater: (cat: Category) => Category
): Category[] => {
  return categories.map(cat => {
    if (cat.id === id) return updater(cat);
    if (cat.children.length > 0) {
      return { ...cat, children: findAndUpdateCategory(cat.children, id, updater) };
    }
    return cat;
  });
};

const findAndRemoveCategory = (categories: Category[], id: string): Category[] => {
  return categories.filter(cat => cat.id !== id).map(cat => ({
    ...cat,
    children: findAndRemoveCategory(cat.children, id),
  }));
};

const addChildCategory = (
  categories: Category[],
  parentId: string | null,
  newCategory: Category
): Category[] => {
  if (parentId === null) return [...categories, newCategory];
  return categories.map(cat => {
    if (cat.id === parentId) {
      return { ...cat, children: [...cat.children, newCategory] };
    }
    if (cat.children.length > 0) {
      return { ...cat, children: addChildCategory(cat.children, parentId, newCategory) };
    }
    return cat;
  });
};

const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    selectCategory: (state, action: PayloadAction<string | null>) => {
      state.selectedCategoryId = action.payload;
    },
    addCategory: (state, action: PayloadAction<{ parentId: string | null; name: string; description?: string }>) => {
      const { parentId, name, description } = action.payload;
      const newCategory: Category = {
        id: `cat-${Date.now()}`,
        name,
        description,
        parentId,
        children: [],
        userGroups: [],
        settings: { defaultReviewerGroupId: null, allowedContentTypes: ['course', 'article'], autoApproval: false },
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.categories = addChildCategory(state.categories, parentId, newCategory);
    },
    updateCategory: (state, action: PayloadAction<{ id: string; name: string; description?: string }>) => {
      const { id, name, description } = action.payload;
      state.categories = findAndUpdateCategory(state.categories, id, cat => ({
        ...cat, name, description, updatedAt: new Date().toISOString(),
      }));
    },
    updateCategorySettings: (state, action: PayloadAction<{ id: string; settings: CategorySettings }>) => {
      state.categories = findAndUpdateCategory(state.categories, action.payload.id, cat => ({
        ...cat, settings: action.payload.settings, updatedAt: new Date().toISOString(),
      }));
    },
    deleteCategory: (state, action: PayloadAction<string>) => {
      state.categories = findAndRemoveCategory(state.categories, action.payload);
      if (state.selectedCategoryId === action.payload) state.selectedCategoryId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCategories.pending, (state) => { state.loading = true; state.error = null; })
      .addCase(fetchCategories.fulfilled, (state, action) => { state.loading = false; state.categories = action.payload; })
      .addCase(fetchCategories.rejected, (state, action) => { state.loading = false; state.error = action.error.message || 'Failed to fetch'; });
  },
});

export const { selectCategory, addCategory, updateCategory, updateCategorySettings, deleteCategory } = contentSlice.actions;
export default contentSlice.reducer;
