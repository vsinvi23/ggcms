import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { Course, CourseSection, Lesson, WorkflowStatus } from '@/types/content';
import { mockCourses } from '@/data/mockContent';

interface CourseState {
  courses: Course[];
  selectedCourseId: string | null;
  selectedLessonId: string | null;
  loading: boolean;
  saving: boolean;
  error: string | null;
  filters: { status: WorkflowStatus | 'all'; categoryId: string | null; search: string };
}

const initialState: CourseState = {
  courses: mockCourses,
  selectedCourseId: null,
  selectedLessonId: null,
  loading: false,
  saving: false,
  error: null,
  filters: { status: 'all', categoryId: null, search: '' },
};

export const fetchCourses = createAsyncThunk('courses/fetchCourses', async () => {
  await new Promise(resolve => setTimeout(resolve, 500));
  return mockCourses;
});

export const saveCourse = createAsyncThunk('courses/saveCourse', async (course: Course) => {
  await new Promise(resolve => setTimeout(resolve, 800));
  return course;
});

const courseSlice = createSlice({
  name: 'courses',
  initialState,
  reducers: {
    selectCourse: (state, action: PayloadAction<string | null>) => {
      state.selectedCourseId = action.payload;
      state.selectedLessonId = null;
    },
    selectLesson: (state, action: PayloadAction<string | null>) => {
      state.selectedLessonId = action.payload;
    },
    setFilters: (state, action: PayloadAction<Partial<CourseState['filters']>>) => {
      state.filters = { ...state.filters, ...action.payload };
    },
    updateCourseSections: (state, action: PayloadAction<{ courseId: string; sections: CourseSection[] }>) => {
      const course = state.courses.find(c => c.id === action.payload.courseId);
      if (course) {
        course.sections = action.payload.sections;
        course.updatedAt = new Date().toISOString();
      }
    },
    updateLesson: (state, action: PayloadAction<{ courseId: string; lesson: Lesson }>) => {
      const course = state.courses.find(c => c.id === action.payload.courseId);
      if (course) {
        course.sections = course.sections.map(section => ({
          ...section,
          subsections: section.subsections.map(sub => ({
            ...sub,
            lessons: sub.lessons.map(l => l.id === action.payload.lesson.id ? action.payload.lesson : l),
          })),
        }));
        course.updatedAt = new Date().toISOString();
      }
    },
    updateCourseStatus: (state, action: PayloadAction<{ courseId: string; status: WorkflowStatus }>) => {
      const course = state.courses.find(c => c.id === action.payload.courseId);
      if (course) {
        course.status = action.payload.status;
        course.updatedAt = new Date().toISOString();
        if (action.payload.status === 'published') course.publishedAt = new Date().toISOString();
      }
    },
    addCourse: (state, action: PayloadAction<Partial<Course>>) => {
      const newCourse: Course = {
        id: action.payload.id || `course-${Date.now()}`,
        title: action.payload.title || 'Untitled Course',
        description: action.payload.description || '',
        categoryId: action.payload.categoryId || '',
        categoryPath: action.payload.categoryPath || [],
        thumbnail: action.payload.thumbnail,
        instructor: action.payload.instructor || '',
        duration: action.payload.duration || 0,
        status: action.payload.status || 'draft',
        sections: action.payload.sections || [],
        tags: action.payload.tags || [],
        language: action.payload.language || 'English',
        createdAt: action.payload.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.courses.push(newCourse);
    },
    updateCourse: (state, action: PayloadAction<Course>) => {
      const index = state.courses.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.courses[index] = { ...action.payload, updatedAt: new Date().toISOString() };
      }
    },
    deleteCourse: (state, action: PayloadAction<string>) => {
      state.courses = state.courses.filter(c => c.id !== action.payload);
      if (state.selectedCourseId === action.payload) state.selectedCourseId = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchCourses.pending, (state) => { state.loading = true; })
      .addCase(fetchCourses.fulfilled, (state, action) => { state.loading = false; state.courses = action.payload; })
      .addCase(saveCourse.pending, (state) => { state.saving = true; })
      .addCase(saveCourse.fulfilled, (state, action) => {
        state.saving = false;
        const index = state.courses.findIndex(c => c.id === action.payload.id);
        if (index !== -1) state.courses[index] = action.payload;
      });
  },
});

export const { selectCourse, selectLesson, setFilters, updateCourseSections, updateLesson, updateCourseStatus, addCourse, updateCourse, deleteCourse } = courseSlice.actions;
export default courseSlice.reducer;
