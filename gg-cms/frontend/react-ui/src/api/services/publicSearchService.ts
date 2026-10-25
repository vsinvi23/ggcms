import axios from 'axios';
import { API_BASE_URL } from '@/config/api';
import type { SearchParams, SearchResponse, SuggestResponse } from '../types';

const searchClient = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
});

export const publicSearchService = {
  search: async (params: SearchParams, signal?: AbortSignal): Promise<SearchResponse> => {
    const res = await searchClient.get('/public/search', { params, signal });
    return res.data.data;
  },

  suggest: async (q: string, limit = 5, signal?: AbortSignal): Promise<SuggestResponse> => {
    const res = await searchClient.get('/public/search/suggest', { params: { q, limit }, signal });
    return res.data.data;
  },
};
