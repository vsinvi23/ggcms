import React, { createContext, useContext } from 'react';
import { useQuery } from '@tanstack/react-query';
import { featuresService, FeatureFlags } from '@/api/services/featuresService';

// All features default to OFF so that if the API is unavailable
// nothing is shown that wasn't explicitly enabled by an admin.
const defaults: FeatureFlags = {
  learning_paths: false,
  interview_prep: false,
  social_login: false,
};

const FeatureFlagContext = createContext<FeatureFlags>(defaults);

export function FeatureFlagProvider({ children }: { children: React.ReactNode }) {
  const { data } = useQuery({
    queryKey: ['features'],
    queryFn: featuresService.getFlags,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });

  return (
    <FeatureFlagContext.Provider value={data ?? defaults}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlags(): FeatureFlags {
  return useContext(FeatureFlagContext);
}
