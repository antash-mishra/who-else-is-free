import { useCallback, useEffect, useRef, useState } from 'react';

import * as Location from 'expo-location';

import { logger } from '@services/logger';
import { Coordinates } from '@utils/distance';

type ViewerLocationPermission = 'granted' | 'denied' | 'undetermined';

export type ViewerLocationState = {
  coords: Coordinates | null;
  permission: ViewerLocationPermission | null;
  isLoading: boolean;
  requestPermission: () => Promise<void>;
};

export const useViewerLocation = (): ViewerLocationState => {
  const [coords, setCoords] = useState<Coordinates | null>(null);
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
    setCoords({
      latitude: position.coords.latitude,
      longitude: position.coords.longitude,
    });
  }, []);

  const inspectPermission = useCallback(
    async (allowPrompt: boolean) => {
      try {
        let permissionResult = await Location.getForegroundPermissionsAsync();
        if (allowPrompt && permissionResult.status === Location.PermissionStatus.UNDETERMINED) {
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
        }
      } catch (error) {
        logger.warn('Unable to resolve viewer location', error);
        if (isMounted.current) {
          setCoords(null);
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

  return { coords, permission, isLoading, requestPermission };
};
