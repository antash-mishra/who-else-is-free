import { useCallback, useEffect, useRef, useState } from 'react';

import * as Location from 'expo-location';

import { logger } from '@services/logger';
import { Coordinates } from '@utils/distance';

type ViewerLocationPermission = 'granted' | 'denied' | 'undetermined';

export type ViewerLocationState = {
  coords: Coordinates | null;
  /** ISO country code resolved from the granted device location, when available. */
  countryCode: string | null;
  permission: ViewerLocationPermission | null;
  isLoading: boolean;
  requestPermission: () => Promise<void>;
};

const normalizeCountryCode = (value: string | null | undefined): string | null => {
  const normalized = value?.trim().toLowerCase() ?? '';
  return /^[a-z]{2}$/.test(normalized) ? normalized : null;
};

export const useViewerLocation = (): ViewerLocationState => {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [countryCode, setCountryCode] = useState<string | null>(null);
  const [permission, setPermission] = useState<ViewerLocationPermission | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const isMounted = useRef(true);
  const pendingRequest = useRef<Promise<void> | null>(null);

  const loadPosition = useCallback(async () => {
    const position =
      (await Location.getLastKnownPositionAsync()) ??
      (await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }));
    if (!isMounted.current) {
      return;
    }
    const nextCoords = {
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    };
    setCoords(nextCoords);

    try {
      const [address] = await Location.reverseGeocodeAsync(nextCoords);
      if (isMounted.current) {
        setCountryCode(normalizeCountryCode(address?.isoCountryCode));
      }
    } catch (error) {
      logger.warn('Unable to resolve viewer country', error);
      if (isMounted.current) {
        setCountryCode(null);
      }
    }
  }, []);

  const inspectPermission = useCallback(
    async (allowPrompt: boolean) => {
      try {
        let permissionResult = await Location.getForegroundPermissionsAsync();
        // Ask whenever the system will actually show a dialog, not only the very
        // first time. expo-location records "we have asked before" in its own
        // SharedPreferences, so from the first denial onwards it reports DENIED
        // instead of UNDETERMINED for good — and that file survives a permission
        // reset and can be restored onto a reinstall by Android auto-backup.
        // Gating on UNDETERMINED alone therefore made the prompt disappear
        // permanently, seemingly at random. `canAskAgain` is the real signal.
        const canPrompt =
          permissionResult.status === Location.PermissionStatus.UNDETERMINED ||
          (!permissionResult.granted && permissionResult.canAskAgain);
        if (allowPrompt && canPrompt) {
          permissionResult = await Location.requestForegroundPermissionsAsync();
        }
        if (!isMounted.current) {
          return;
        }
        setPermission(permissionResult.status);

        if (permissionResult.status === Location.PermissionStatus.GRANTED) {
          await loadPosition();
        } else {
          setCoords(null);
          setCountryCode(null);
        }
      } catch (error) {
        logger.warn('Unable to resolve viewer location', error);
        if (isMounted.current) {
          setCoords(null);
          setCountryCode(null);
        }
      } finally {
        if (isMounted.current) {
          setIsLoading(false);
        }
      }
    },
    [loadPosition],
  );

  const requestPermission = useCallback(() => {
    if (!pendingRequest.current) {
      pendingRequest.current = inspectPermission(true).finally(() => {
        pendingRequest.current = null;
      });
    }
    return pendingRequest.current;
  }, [inspectPermission]);

  useEffect(() => {
    isMounted.current = true;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- Native permission inspection resolves asynchronously before updating hook state.
    inspectPermission(false);

    return () => {
      isMounted.current = false;
    };
  }, [inspectPermission]);

  return { coords, countryCode, permission, isLoading, requestPermission };
};
