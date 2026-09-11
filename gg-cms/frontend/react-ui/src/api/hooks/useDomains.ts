import { useQuery } from '@tanstack/react-query';
import { domainService } from '../services/domainService';

export const useDomains = () =>
  useQuery({
    queryKey: ['domains'] as const,
    queryFn: domainService.getAll,
    staleTime: 5 * 60_000,
  });
