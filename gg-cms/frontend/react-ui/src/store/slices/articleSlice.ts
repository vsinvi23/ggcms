import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Article, SeoSettings, WorkflowStatus, Attachment } from '@/types/content';
import { mockArticles } from '@/data/mockContent';

interface ArticleState {
  articles: Article[];
  selectedArticleId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  filters: { status: WorkflowStatus | 'all'; categoryId: string | null; search: string };
}

const initialState: ArticleState = {
  articles: mockArticles,
  selectedArticleId: null,
  loading: false,
  saving: false,
  error: null,
  filters: { status: 'all', categoryId: null, search: '' },
};

export const fetchArticles = createAsyncThunk('articles/fetchArticles', async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return mockArticles;
});

export const saveArticle = createAsyncThunk('articles/saveArticle', async (article: Article) => {
  await new Promise(resolve => setTimeout(resolve, 800));
  return article;
});

const articleSlice = createSlice({
  name: 'articles',
  initialState,
  reducers: {
    selectArticle: (state, action: PayloadAction<string | null>) => {
      state.selectedArticleId = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<ArticleState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    updateArticle: (state, action: PayloadAction<Article>) => {
      const index = state.articles.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.articles[index] = { ...action.payload, updatedAt: new Date().toISOString() };
      }
    },
    updateArticleSeo: (state, action: PayloadAction<{ articleId: string; seo: SeoSettings }>) => {
      const article = state.articles.find(a => a.id === action.payload.articleId);
      if (article) {
        article.seo = action.payload.seo;
        article.updatedAt = new Date().toISOString();
      }
    },
    updateArticleStatus: (state, action: PayloadAction<{ articleId: string; status: WorkflowStatus }>) => {
      const article = state.articles.find(a => a.id === action.payload.articleId);
      if (article) {
        article.status = action.payload.status;
        article.updatedAt = new Date().toISOString();
        if (action.payload.status === 'published') article.publishedAt = new Date().toISOString();
      }
    },
    scheduleArticle: (state, action: PayloadAction<{ articleId: string; date: string | undefined }>) => {
      const article = state.articles.find(a => a.id === action.payload.articleId);
      if (article) {
        article.scheduledPublishDate = action.payload.date;
        article.updatedAt = new Date().toISOString();
      }
    },
    addArticle: (state, action: PayloadAction<Partial<Article>>) => {
      const newArticle: Article = {
        id: `article-${Date.now()}`,
        title: action.payload.title || 'Untitled Article',
        slug: action.payload.slug || '',
        content: '',
        excerpt: '',
        categoryId: action.payload.categoryId || '',
        categoryPath: action.payload.categoryPath || [],
        author: action.payload.author || '',
        status: 'draft',
        seo: { metaTitle: '', metaDescription: '', keywords: [] },
        attachments: [],
        tags: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.articles.push(newArticle);
    },
    deleteArticle: (state, action: PayloadAction<string>) => {
      state.articles = state.articles.filter(a => a.id !== action.payload);
      if (state.selectedArticleId === action.payload) state.selectedArticleId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchArticles.pending, (state) => { state.loading = true; })
      .addCase(fetchArticles.fulfilled, (state, action) => { state.loading = false; state.articles = action.payload; })
      .addCase(saveArticle.pending, (state) => { state.saving = true; })
      .addCase(saveArticle.fulfilled, (state, action) => {
        state.saving = false;
        const index = state.articles.findIndex(a => a.id === action.payload.id);
        if (index !== -1) state.articles[index] = action.payload;
      });
  },
});

export const { selectArticle, setFilters, updateArticle, updateArticleSeo, updateArticleStatus, scheduleArticle, addArticle, deleteArticle } = articleSlice.actions;
export default articleSlice.reducer;
