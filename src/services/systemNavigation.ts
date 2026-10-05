import { Platform } from 'react-native';

import { requireNativeModule } from 'expo-modules-core';

import { logger } from './logger';

interface SystemNavigationModule {
  setOnboardingActive(active: boolean): Promise<void>;
}

/** Restore Android's normal system-bar protection as soon as onboarding loses focus. */
export function setOnboardingNavigationActive(active: boolean): void {
  if (Platform.OS !== 'android') return;
  const native = requireNativeModule<SystemNavigationModule>('SystemNavigation');
  void native.setOnboardingActive(active).catch((error: unknown) => {
    logger.error('Unable to update onboarding system navigation', error);
  });
}
