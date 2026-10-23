import { useQuery } from '@tanstack/react-query';
import { certificateService } from '../services/certificateService';

export const certificateKeys = {
  all: ['certificates'] as const,
  mine: () => [...certificateKeys.all, 'mine'] as const,
  verify: (code: string) => [...certificateKeys.all, 'verify', code] as const,
};

export const useMyCertificates = (enabled = true) =>
  useQuery({
    queryKey: certificateKeys.mine(),
    queryFn: () => certificateService.getMine(),
    enabled,
  });

export const useVerifyCertificate = (code: string) =>
  useQuery({
    queryKey: certificateKeys.verify(code),
    queryFn: () => certificateService.verify(code),
    enabled: !!code,
    retry: false,
  });
