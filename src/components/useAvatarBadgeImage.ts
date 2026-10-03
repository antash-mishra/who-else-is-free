import { useEffect, useState } from 'react';

import { Skia, type SkImage } from '@shopify/react-native-skia';

/** Decode once per source, keep the decoded image while mounted, discard stale loads. */
export function useAvatarBadgeImage(uri: string | null): SkImage | null {
  const [loaded, setLoaded] = useState<{ uri: string; image: SkImage | null } | null>(null);
  useEffect(() => {
    if (!uri) return;
    let active = true;
    void (async () => {
      try {
        // Android Skia's URI loader does not decode data URLs. Profile uploads
        // arrive as base64; decode their bytes explicitly instead of loading a URL.
        const data =
          uri.startsWith('data:') && uri.includes(';base64,')
            ? Skia.Data.fromBase64(uri.slice(uri.indexOf(',') + 1))
            : await Skia.Data.fromURI(uri);
        const image = Skia.Image.MakeImageFromEncoded(data);
        if (active) setLoaded({ uri, image });
      } catch {
        // Match expo-image's empty loading/error backdrop, without leaking the URI.
        if (active) setLoaded({ uri, image: null });
      }
    })();
    return () => {
      active = false;
    };
  }, [uri]);
  return loaded?.uri === uri ? loaded.image : null;
}
