import { useCallback, useEffect, useRef, useState } from "react";
import { API_BASE_URL } from "@api/config";

export interface PlacePrediction {
  placeId: string;
  mainText: string;
  secondaryText: string;
}

export interface PlaceDetail {
  placeId: string;
  displayName: string;
  formattedAddress: string;
  latitude: number;
  longitude: number;
}

interface UsePlacesAutocompleteResult {
  results: PlacePrediction[];
  loading: boolean;
  error: string | null;
  search: (query: string) => void;
  clear: () => void;
}

export const usePlacesAutocomplete = (): UsePlacesAutocompleteResult => {
  const [results, setResults] = useState<PlacePrediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const search = useCallback((query: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }

    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setLoading(false);
      setError(null);
      return;
    }

    setLoading(true);
    setError(null);

    debounceRef.current = setTimeout(async () => {
      abortRef.current = new AbortController();
      try {
        const response = await fetch(
          `${API_BASE_URL}/api/places/autocomplete?input=${encodeURIComponent(trimmed)}`,
          { signal: abortRef.current.signal },
        );
        if (!response.ok) {
          throw new Error("Failed to fetch places");
        }
        const data = (await response.json()) as { predictions?: PlacePrediction[] };
        setResults(data.predictions ?? []);
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        setError("Could not load places. Try again.");
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, []);

  const clear = useCallback(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setResults([]);
    setLoading(false);
    setError(null);
  }, []);

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (abortRef.current) {
        abortRef.current.abort();
      }
    };
  }, []);

  return { results, loading, error, search, clear };
};

export const fetchPlaceDetails = async (placeId: string): Promise<PlaceDetail> => {
  const response = await fetch(
    `${API_BASE_URL}/api/places/details?placeId=${encodeURIComponent(placeId)}`,
  );
  if (!response.ok) {
    throw new Error("Failed to fetch place details");
  }
  return (await response.json()) as PlaceDetail;
};
