import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { requestJson } from '@api/client';
import {
  ApiCoverCategory,
  ApiCoverOption,
  CoverCategory,
  CoverOption,
  DEFAULT_COVER_OPTION,
  DEFAULT_EVENT_IMAGE,
  mapApiCoverCategory,
  mapApiCoverOption,
  resolveCoverUri,
} from '@constants/covers';
import { logger } from '@services/logger';

type CoversContextValue = {
  covers: readonly CoverOption[];
  categories: readonly CoverCategory[];
  isLoading: boolean;
  refreshCovers: () => Promise<void>;
  resolveCover: (key?: string | null) => string;
  getCoverSource: (key?: string | null) => CoverOption['source'];
};

const CoversContext = createContext<CoversContextValue | undefined>(undefined);

const fallbackCoverOption = (DEFAULT_COVER_OPTION as CoverOption | undefined) ?? {
  key: 'sports-badminton-1',
  label: 'Badminton',
  fileName: 'sports-badminton-1.png',
  url: 'https://example.com/cover.png',
  source: { uri: 'https://example.com/cover.png' },
  category: 'sports',
  tags: ['Badminton'],
};

const fallbackEventImage = DEFAULT_EVENT_IMAGE || fallbackCoverOption.url;

const safeResolveCoverUri = (key?: string | null, options?: readonly CoverOption[]) => {
  try {
    return resolveCoverUri(key, options);
  } catch {
    return fallbackCoverOption.url;
  }
};

const fallbackCoversContext: CoversContextValue = {
  covers: [fallbackCoverOption],
  categories: [],
  isLoading: false,
  refreshCovers: async () => undefined,
  resolveCover: (key?: string | null) => safeResolveCoverUri(key, [fallbackCoverOption]),
  getCoverSource: (key?: string | null) => ({
    uri: safeResolveCoverUri(key, [fallbackCoverOption]),
  }),
};

export const CoversProvider = ({ children }: { children: ReactNode }) => {
  const [covers, setCovers] = useState<readonly CoverOption[]>([fallbackCoverOption]);
  const [categories, setCategories] = useState<readonly CoverCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCovers = useCallback(async () => {
    setIsLoading(true);
    try {
      const payload = await requestJson<{ data?: unknown; categories?: unknown }>('/api/covers', {
        timeoutMs: null,
        errorMessage: (status) => `Request failed with status ${status}`,
      });
      const data = payload?.data;
      const nextCovers = Array.isArray(data)
        ? data
            .map((item) => mapApiCoverOption(item as ApiCoverOption))
            .filter((item) => item.key.trim().length > 0)
        : [];
      setCovers(nextCovers.length > 0 ? nextCovers : [fallbackCoverOption]);
      const rawCategories = payload?.categories;
      const nextCategories = Array.isArray(rawCategories)
        ? rawCategories
            .map((item) => mapApiCoverCategory(item as ApiCoverCategory))
            .filter((item): item is CoverCategory => item !== null)
        : [];
      setCategories(nextCategories);
    } catch (err) {
      logger.warn('Failed to fetch cover catalog', err);
      setCovers((current) => (current.length > 0 ? current : [fallbackCoverOption]));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshCovers().catch(() => undefined);
  }, [refreshCovers]);

  const value = useMemo<CoversContextValue>(() => {
    const resolveCover = (key?: string | null) => safeResolveCoverUri(key, covers);
    const getCoverSource = (key?: string | null) => {
      const uri = resolveCover(key);
      return uri ? { uri } : { uri: fallbackEventImage };
    };
    return {
      covers,
      categories,
      isLoading,
      refreshCovers,
      resolveCover,
      getCoverSource,
    };
  }, [covers, categories, isLoading, refreshCovers]);

  return <CoversContext.Provider value={value}>{children}</CoversContext.Provider>;
};

export const useCovers = () => {
  const context = useContext(CoversContext);
  return context ?? fallbackCoversContext;
};
