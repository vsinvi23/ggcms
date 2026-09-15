import { useQuery } from '@tanstack/react-query';
import { logService, DebugLogEntry } from '../services/logService';

export function useDebugLogs(level?: string) {
  return useQuery<DebugLogEntry[]>({
    queryKey: ['debug-logs', level],
    queryFn: () => logService.getDebugLogs(level),
    refetchInterval: 10_000, // Auto-refresh live logs every 10s
  });
}
