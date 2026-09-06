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
        // Ask whenever we do not already hold the permission, and let the OS
        // decide whether a dialog is warranted. expo's reported status cannot
        // carry that decision:
        //
        //   - it derives UNDETERMINED vs DENIED from its own record of having
        //     asked, kept in the SharedPreferences file
        //     expo.modules.permissions.asked;
        //   - Android auto-backup restores that file onto a fresh install
        //     (the generated backup rules include every sharedpref except
        //     SecureStore), so a brand new install can report DENIED;
        //   - canAskAgain is shouldShowRequestPermissionRationale, which is
        //     false when Android has never actually asked.
        //
        // A restored flag therefore produces DENIED + canAskAgain false, which
        // is indistinguishable from a permanent refusal even though the system
        // would happily show the dialog. Requesting is the only reliable
        // signal, and costs nothing when the permission really is blocked:
        // the OS returns immediately without showing anything.
        if (allowPrompt && !permissionResult.granted) {
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
