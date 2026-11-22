import { useCallback } from 'react';

import { InteractionManager } from 'react-native';

import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useBloom } from '@context/BloomContext';
import { useCovers } from '@context/CoversContext';
import { RootStackParamList } from '@navigation/types';

import type { StackNavigationProp } from '@react-navigation/stack';

/**
 * Prepare one hidden form after Main's navigation interactions have settled.
 *
 * Waits for the launch transition too: building the form takes most of a second
 * on a slow Android phone, and doing it while the splash's white bloom still
 * covers Discover held the bloom up for that long (the fade's timer could not
 * run until the form had mounted).
 */
export const usePrepareCreateEvent = () => {
  const navigation = useNavigation<StackNavigationProp<RootStackParamList>>();
  const { isLoading } = useCovers();
  const { transitionComplete } = useBloom();

  useFocusEffect(
    useCallback(() => {
      if (isLoading || !transitionComplete) return undefined;
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
    }, [isLoading, navigation, transitionComplete]),
  );
};
