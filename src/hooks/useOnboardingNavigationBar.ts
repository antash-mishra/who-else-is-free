import { useCallback } from 'react';

import { useFocusEffect } from '@react-navigation/native';

import { setOnboardingNavigationActive } from '@services/systemNavigation';

/** The three onboarding steps share a route; other routes keep the native default. */
export function useOnboardingNavigationBar(): void {
  useFocusEffect(
    useCallback(() => {
      setOnboardingNavigationActive(true);
      return () => setOnboardingNavigationActive(false);
    }, []),
  );
}
