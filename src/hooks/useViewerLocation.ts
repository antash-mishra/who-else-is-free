import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

import { logger } from '@services/logger';
import { Coordinates } from '@utils/distance';

type ViewerLocationPermission = 'granted' | 'denied' | 'undetermined';

export type ViewerLocationState = {
  coords: Coordinates | null;
  permission: ViewerLocationPermission | null;
  isLoading: boolean;
};

export const useViewerLocation = (): ViewerLocationState => {
  const [coords, setCoords] = useState<Coordinates | null>(null);
  const [permission, setPermission] = useState<ViewerLocationPermission | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const loadLocation = async () => {
      try {
        const permissionResult = await Location.requestForegroundPermissionsAsync();
        if (!isMounted) {
          return;
        }
        setPermission(permissionResult.status);

        if (permissionResult.status !== Location.PermissionStatus.GRANTED) {
          setCoords(null);
          return;
        }

        // Prefer the OS's cached fix: it resolves instantly and avoids the
        // "current location is unavailable" failure when no fresh fix is ready
        // (cold start, indoors, emulator). Fall back to requesting a new one.
        const position =
          (await Location.getLastKnownPositionAsync()) ??
          (await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          }));
        if (!isMounted) {
          return;
        }
        setCoords({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      } catch (error) {
        logger.warn('Unable to resolve viewer location', error);
        if (isMounted) {
          setCoords(null);
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadLocation();

    return () => {
      isMounted = false;
    };
  }, []);

  return { coords, permission, isLoading };
};
