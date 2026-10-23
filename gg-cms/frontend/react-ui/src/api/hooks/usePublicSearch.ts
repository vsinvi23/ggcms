import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { publicSearchService } from '../services/publicSearchService';
import type { SearchParams } from '../types';

export const MIN_SUGGEST_LENGTH = 2;

export const searchKeys = {
  results: (params: SearchParams) => ['public-search', params] as const,
  suggest: (q: string, limit: number) => ['public-search-suggest', q, limit] as const,
};

export const hasSearchCriteria = (p: SearchParams): boolean =>
  !!(p.q?.trim() || p.category || p.topic || p.level || (p.type && p.type !== 'all'));

export const usePublicSearch = (params: SearchParams) =>
  useQuery({
    queryKey: searchKeys.results(params),
    queryFn: ({ signal }) => publicSearchService.search(params, signal),
    enabled: hasSearchCriteria(params),
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });

export const useSearchSuggest = (q: string, limit = 5) => {
  const term = q.trim();
  return useQuery({
    queryKey: searchKeys.suggest(term, limit),
    queryFn: ({ signal }) => publicSearchService.suggest(term, limit, signal),
    enabled: term.length >= MIN_SUGGEST_LENGTH,
    placeholderData: keepPreviousData,
    staleTime: 30 * 1000,
  });
};
