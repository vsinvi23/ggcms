import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { taskService } from '../services/taskService';
import { TaskCreateDto } from '../types';

// Query keys
export const taskKeys = {
  all: ['tasks'] as const,
  list: (params?: Record<string, unknown>) => [...taskKeys.all, 'list', params] as const,
  detail: (id: number) => [...taskKeys.all, id] as const,
};

/**
 * Hook to fetch paginated tasks
 */
export const useTasksQuery = (params?: {
  type?: string;
  status?: string;
  ownershipType?: string;
  page?: number;
  pageSize?: number;
}) => {
  return useQuery({
    queryKey: taskKeys.list(params),
    queryFn: () => taskService.getTasks(params),
  });
};

/**
 * Hook to fetch a single task by ID
 */
export const useTask = (id: number, enabled = true) => {
  return useQuery({
    queryKey: taskKeys.detail(id),
    queryFn: () => taskService.getTask(id),
    enabled: enabled && !!id,
  });
};

/**
 * Hook to create a new task
 */
export const useCreateTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskCreateDto) => taskService.createTask(data),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
};

/**
 * Hook to update a task
 */
export const useUpdateTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<TaskCreateDto> }) =>
      taskService.updateTask(id, data),
    onSuccess: (_, { id }) => {
      qc.invalidateQueries({ queryKey: taskKeys.detail(id) });
      qc.invalidateQueries({ queryKey: taskKeys.all });
    },
  });
};

/**
 * Hook to delete a task
 */
export const useDeleteTask = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => taskService.deleteTask(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: taskKeys.all }),
  });
};
