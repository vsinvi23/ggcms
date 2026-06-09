import { configureStore } from '@reduxjs/toolkit';
import userReducer from './slices/userSlice';
import contentReducer from './slices/contentSlice';
import courseReducer from './slices/courseSlice';
import articleReducer from './slices/articleSlice';

export const store = configureStore({
  reducer: {
    users: userReducer,
    content: contentReducer,
    courses: courseReducer,
    articles: articleReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
