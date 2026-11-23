import { useCallback, useRef, useState } from 'react';

import { Platform } from 'react-native';

import * as Location from 'expo-location';
import * as SecureStore from 'expo-secure-store';

import type { LocationPermissionSheetProps } from '@components/location-permission/LocationPermissionSheet';

/**
 * Set once the sheet has been answered either way, so it is offered once per
 * install. SecureStore is excluded from Android auto-backup, so a reinstall
 * offers it again.
 */
export const LOCATION_PROMPT_SEEN_KEY = 'whoelseisfree.locationPromptSeen';

type Choice = 'continue' | 'close';

/**
 * Runs the location permission sheet before the system prompt.
 *
 * `offer()` resolves once the flow is over: immediately when location is
 * already granted, the sheet was answered before, or iOS can no longer show
 * its prompt; otherwise after the person closes the sheet, or after the system
 * prompt they reached through Continue.
 *
 * Only `granted` decides whether to offer it. On Android expo derives "denied,
 * can't ask again" from a record that auto-backup restores onto fresh installs
 * (see useViewerLocation), so that status cannot be trusted there.
 */
export const useLocationPermissionPrompt = (requestPermission: () => Promise<void>) => {
  const [visible, setVisible] = useState(false);
  const choiceRef = useRef<Choice | null>(null);
  const resolveRef = useRef<(() => void) | null>(null);

  const offer = useCallback(async () => {
    try {
      const current = await Location.getForegroundPermissionsAsync();
      if (current.granted) return;
      if (Platform.OS === 'ios' && !current.canAskAgain) return;
      if (await SecureStore.getItemAsync(LOCATION_PROMPT_SEEN_KEY)) return;
    } catch {
      return;
    }

    await new Promise<void>((resolve) => {
      choiceRef.current = null;
      resolveRef.current = resolve;
      setVisible(true);
    });
  }, []);

  const choose = useCallback((choice: Choice) => {
    if (choiceRef.current) return;
    choiceRef.current = choice;
    SecureStore.setItemAsync(LOCATION_PROMPT_SEEN_KEY, '1').catch(() => undefined);
    setVisible(false);
  }, []);

  const onContinue = useCallback(() => choose('continue'), [choose]);
  const onDismiss = useCallback(() => choose('close'), [choose]);

  // Ask the system only once the sheet is gone, so its dialog never appears
  // over a sheet that is still closing.
  const onClosed = useCallback(() => {
    const resolve = resolveRef.current;
    resolveRef.current = null;
    if (!resolve) return;
    const next = choiceRef.current === 'continue' ? requestPermission() : Promise.resolve();
    next.catch(() => undefined).finally(resolve);
  }, [requestPermission]);

  const sheetProps: LocationPermissionSheetProps = { visible, onContinue, onDismiss, onClosed };

  return { offer, sheetProps };
};
