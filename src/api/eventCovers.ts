/* global fetch, Blob */
import { Platform } from 'react-native';

import { requestJson } from '@api/client';
import { API_BASE_URL } from '@api/config';

export type CoverAsset = { uri: string; mimeType?: string };
export type UploadedCover = { id: string; url: string };
export const resolveUploadedCoverUrl = (url?: string | null): string | undefined => {
  if (!url) return undefined;
  if (url.startsWith('/api/event-covers/')) return `${API_BASE_URL}${url}`;
  if (url.startsWith('https://') || url.startsWith('http://')) return url;
  return undefined;
};
export const uploadEventCover = async (
  asset: CoverAsset,
  token: string,
  fetchImpl?: typeof fetch,
): Promise<UploadedCover> => {
  const body = new FormData();
  if (Platform.OS === 'web') {
    const response = await fetch(asset.uri);
    body.append('image', await response.blob());
  } else {
    // React Native's FormData accepts a local file descriptor, unlike DOM typings.
    body.append('image', {
      uri: asset.uri,
      name: 'cover.jpg',
      type: asset.mimeType ?? 'image/jpeg',
    } as unknown as Blob);
  }
  const response = await requestJson<{ cover_upload_id: string; cover_url: string }>(
    '/api/event-covers',
    {
      method: 'POST',
      body,
      token,
      fetchImpl,
      timeoutMs: 60_000,
    },
  );
  const url = resolveUploadedCoverUrl(response?.cover_url);
  if (!response?.cover_upload_id || !url) throw new Error('Invalid cover upload response');
  return { id: response.cover_upload_id, url };
};
