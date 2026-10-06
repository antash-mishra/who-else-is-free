import { useCallback, useRef, useState } from 'react';

import type { CoverAsset } from '@api/eventCovers';

export const usePickEventCover = (onSelect: (asset: CoverAsset) => void) => {
  const busy = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [isPicking, setIsPicking] = useState(false);
  const pick = useCallback(async () => {
    if (busy.current) return;
    busy.current = true;
    setIsPicking(true);
    setError(null);
    try {
      const ImagePicker: typeof import('expo-image-picker') = require('expo-image-picker');
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow photo access to choose a cover.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });
      const asset = result.assets?.[0];
      if (!result.canceled && asset) {
        if (asset.fileSize && asset.fileSize > 5 * 1024 * 1024) {
          setError('Choose a photo smaller than 5 MiB.');
          return;
        }
        onSelect({ uri: asset.uri, mimeType: asset.mimeType ?? 'image/jpeg' });
      }
    } catch {
      setError('Unable to open your photo library. Please try again.');
    } finally {
      busy.current = false;
      setIsPicking(false);
    }
  }, [onSelect]);
  return { pick, error, isPicking };
};
