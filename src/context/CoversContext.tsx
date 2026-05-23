import {
  createContext,
  ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

import { API_BASE_URL } from "@api/config";
import {
  ApiCoverOption,
  CoverOption,
  DEFAULT_COVER_OPTION,
  DEFAULT_EVENT_IMAGE,
  mapApiCoverOption,
  resolveCoverUri,
} from "@constants/covers";

type CoversContextValue = {
  covers: readonly CoverOption[];
  isLoading: boolean;
  refreshCovers: () => Promise<void>;
  resolveCover: (key?: string | null) => string;
  getCoverSource: (key?: string | null) => CoverOption["source"];
};

const CoversContext = createContext<CoversContextValue | undefined>(undefined);

const fallbackCoverOption =
  (DEFAULT_COVER_OPTION as CoverOption | undefined) ?? {
    key: "badminton",
    label: "Badminton",
    fileName: "badminton.png",
    url: "https://example.com/cover.png",
    source: { uri: "https://example.com/cover.png" },
  };

const fallbackEventImage = DEFAULT_EVENT_IMAGE || fallbackCoverOption.url;

const safeResolveCoverUri = (
  key?: string | null,
  options?: readonly CoverOption[],
) => {
  try {
    return resolveCoverUri(key, options);
  } catch {
    return fallbackCoverOption.url;
  }
};

const fallbackCoversContext: CoversContextValue = {
  covers: [fallbackCoverOption],
  isLoading: false,
  refreshCovers: async () => undefined,
  resolveCover: (key?: string | null) => safeResolveCoverUri(key, [fallbackCoverOption]),
  getCoverSource: (key?: string | null) => ({
    uri: safeResolveCoverUri(key, [fallbackCoverOption]),
  }),
};

export const CoversProvider = ({ children }: { children: ReactNode }) => {
  const [covers, setCovers] = useState<readonly CoverOption[]>([fallbackCoverOption]);
  const [isLoading, setIsLoading] = useState(false);

  const refreshCovers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/covers`);
      if (!response.ok) {
        throw new Error(`Request failed with status ${response.status}`);
      }
      const payload = (await response.json()) as { data?: unknown };
      const nextCovers = Array.isArray(payload.data)
        ? payload.data
            .map((item) => mapApiCoverOption(item as ApiCoverOption))
            .filter((item) => item.key.trim().length > 0)
        : [];
      setCovers(nextCovers.length > 0 ? nextCovers : [fallbackCoverOption]);
    } catch (err) {
      console.warn("Failed to fetch cover catalog", err);
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
      isLoading,
      refreshCovers,
      resolveCover,
      getCoverSource,
    };
  }, [covers, isLoading, refreshCovers]);

  return (
    <CoversContext.Provider value={value}>
      {children}
    </CoversContext.Provider>
  );
};

export const useCovers = () => {
  const context = useContext(CoversContext);
  return context ?? fallbackCoversContext;
};
