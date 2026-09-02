import { ImageSourcePropType } from 'react-native';

import { API_BASE_URL } from '@api/config';

export type CoverKey = string;

export type CoverOption = {
  key: CoverKey;
  label: string;
  fileName: string;
  url: string;
  source: ImageSourcePropType;
  category: string;
  tags: string[];
};

export type ApiCoverOption = {
  key: string;
  label: string;
  file_name?: string;
  url?: string;
  category?: string;
  tags?: string[];
};

export type CoverCategory = {
  key: string;
  label: string;
};

export type ApiCoverCategory = {
  key?: string;
  label?: string;
};

export const GENERIC_COVER_CATEGORY = 'generic';

export const DEFAULT_COVER_KEY: CoverKey = 'sports-badminton-1';

const coverAssetUrl = (fileName: string) =>
  `${API_BASE_URL}/assets/covers/${encodeURIComponent(fileName)}`;

export const DEFAULT_EVENT_IMAGE = coverAssetUrl('sports-badminton-1.png');

export const DEFAULT_COVER_OPTION: CoverOption = {
  key: DEFAULT_COVER_KEY,
  label: 'Badminton',
  fileName: 'sports-badminton-1.png',
  url: DEFAULT_EVENT_IMAGE,
  source: { uri: DEFAULT_EVENT_IMAGE },
  category: 'sports',
  tags: ['Badminton'],
};

export const COVER_OPTIONS: readonly CoverOption[] = [DEFAULT_COVER_OPTION];

/** Select a catalog cover for a new plan without coupling form state to the cover provider. */
export const getRandomCoverKey = (
  covers: readonly Pick<CoverOption, 'key'>[],
  random: () => number = Math.random,
): CoverKey => {
  const available = covers.filter((cover) => cover.key.trim().length > 0);
  if (available.length === 0) {
    return DEFAULT_COVER_KEY;
  }

  const index = Math.min(available.length - 1, Math.floor(random() * available.length));
  return available[index].key;
};

const uriCache: Record<string, string> = {};

const normalizeCoverUrl = (url?: string, fileName?: string) => {
  if (url?.startsWith('http://') || url?.startsWith('https://')) {
    return url;
  }
  if (url?.startsWith('/')) {
    return `${API_BASE_URL}${url}`;
  }
  if (fileName) {
    return coverAssetUrl(fileName);
  }
  return DEFAULT_EVENT_IMAGE;
};

export const mapApiCoverOption = (option: ApiCoverOption): CoverOption => {
  const fileName = option.file_name ?? `${option.key}.png`;
  const url = normalizeCoverUrl(option.url, fileName);
  return {
    key: option.key,
    label: option.label,
    fileName,
    url,
    source: { uri: url },
    category: option.category ?? GENERIC_COVER_CATEGORY,
    tags: Array.isArray(option.tags) ? option.tags : [],
  };
};

export const mapApiCoverCategory = (category: ApiCoverCategory): CoverCategory | null => {
  const key = category.key?.trim();
  if (!key) {
    return null;
  }
  return { key, label: category.label?.trim() || key };
};

export const resolveCoverUri = (key?: string | null, options?: readonly CoverOption[]) => {
  if (!key) {
    return DEFAULT_EVENT_IMAGE;
  }
  if (key === 'cover_01') {
    return DEFAULT_EVENT_IMAGE;
  }
  const option = options?.find((item) => item.key === key);
  if (option?.url) {
    return option.url;
  }
  if (uriCache[key]) {
    return uriCache[key];
  }
  const resolved = coverAssetUrl(`${key}.png`);
  uriCache[key] = resolved;
  return resolved;
};

export const isCoverKey = (value: string): value is CoverKey => value.trim().length > 0;
