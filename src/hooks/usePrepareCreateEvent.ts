import { useCallback } from 'react';

import { InteractionManager } from 'react-native';

import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useCovers } from '@context/CoversContext';
import { RootStackParamList } from '@navigation/types';

import type { StackNavigationProp } from '@react-navigation/stack';

/** Prepare one hidden form after Main's navigation interactions have settled. */
export const usePrepareCreateEvent = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { isLoading } = useCovers();

  useFocusEffect(
    useCallback(() => {
      if (isLoading) return undefined;
      const task = InteractionManager.runAfterInteractions(() => {
        // Main may have lost focus while work was queued. Never prepare over a
        // live Create/Edit route or replace an existing form draft.
        if (!navigation.isFocused()) return;
        const state = navigation.getState();
        if (
          [...state.routes, ...state.preloadedRoutes].some((route) => route.name === 'CreateEvent')
        ) {
          return;
        }
        navigation.preload('CreateEvent', { editEventId: null });
      });
      return () => task.cancel();
    }, [isLoading, navigation]),
  );
};
