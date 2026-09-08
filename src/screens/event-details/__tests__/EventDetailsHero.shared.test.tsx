import React from 'react';

import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { act, fireEvent, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import {
  EventSharedTransitionProvider,
  useEventSharedTransition,
  useEventSharedTransitionState,
} from '@components/events/EventSharedTransition';
import { resetPlacedIds } from '@components/motion';
import * as SteadyTiming from '@utils/steadyTiming';

import EventDetailsHero from '../EventDetailsHero';
import EventDetailsInfo from '../EventDetailsInfo';

const navigate = jest.fn();
const source = {
  imageUri: 'https://example.test/a.jpg',
  title: 'Pub quiz',
  titleStyle: { fontSize: 17 },
  coverRef: {
    current: {
      measureInWindow: (cb: (...n: number[]) => void) => cb(16, 224, 80, 80),
    } as unknown as View,
  },
  titleRef: {
    current: {
      measureInWindow: (cb: (...n: number[]) => void) => cb(112, 224, 280, 20),
    } as unknown as Text,
  },
};

const infoProps = {
  title: 'Pub quiz',
  hostLine: 'Hosted by Sam',
  readOnly: false,
  isSingleEvent: true,
  goingParticipants: [],
  goingCount: 0,
  location: 'Dublin',
  scheduleLine: 'Tonight at 19:00',
  audienceLine: 'Everyone',
};

const Harness = () => {
  const { open } = useEventSharedTransition();
  const state = useEventSharedTransitionState();
  return (
    <>
      <Text testID="state">{`${state.eventId ?? 'idle'}:${state.phase ?? 'none'}`}</Text>
      <Pressable testID="open" onPress={() => open('e1', source, navigate)} />
      <EventDetailsHero
        imageUri="https://example.test/a.jpg"
        eventId="e1"
        sharedCover
        topInset={0}
      />
      <EventDetailsInfo {...infoProps} eventId="e1" sharedTitle />
    </>
  );
};

const opacityOf = (element: { props: Record<string, unknown> }) =>
  (StyleSheet.flatten(element.props.style as StyleProp<ViewStyle>) ?? {}).opacity ?? 1;

describe('Event Details shared landing', () => {
  beforeEach(() => {
    resetPlacedIds();
    navigate.mockReset();
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation((callback) => callback(92, 103, 228, 228));
    jest
      .spyOn(Text.prototype, 'measureInWindow')
      .mockImplementation((callback) => callback(16, 420, 380, 36));
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(false);
    // Keep the flight in the air so the hidden duplicates are observable.
    jest
      .spyOn(SteadyTiming, 'withSteadyTiming')
      .mockImplementation((value: unknown) => value as never);
  });
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('shows the cover and title normally when nothing is in flight', () => {
    const screen = render(
      <EventSharedTransitionProvider>
        <Harness />
      </EventSharedTransitionProvider>,
    );
    expect(opacityOf(screen.getByTestId('hero-cover-card'))).toBe(1);
    expect(opacityOf(screen.getByTestId('event-details-title'))).toBe(1);
  });

  it('hides and lands the image while keeping text in the page', () => {
    const screen = render(
      <EventSharedTransitionProvider>
        <Harness />
      </EventSharedTransitionProvider>,
    );
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledWith(true);
    expect(opacityOf(screen.getByTestId('hero-cover-card'))).toBe(0);
    expect(opacityOf(screen.getByTestId('event-details-title'))).toBe(1);

    fireEvent(screen.getByTestId('hero-cover-card').parent!, 'layout');
    fireEvent(screen.getByTestId('flying-cover-image', { includeHiddenElements: true }), 'load');
    expect(screen.getByTestId('state').props.children).toBe('e1:landing');
    expect(screen.queryByTestId('flying-title', { includeHiddenElements: true })).toBeNull();
    expect(screen.getByTestId('event-details-title').props.onLayout).toBeUndefined();
  });

  it('shows the resting cover once retained and hides it again as soon as a return moves', () => {
    const timing = jest.spyOn(SteadyTiming, 'withSteadyTiming');
    const sharedValues = jest.spyOn(Reanimated, 'useSharedValue');
    const screen = render(
      <EventSharedTransitionProvider>
        <Harness />
      </EventSharedTransitionProvider>,
    );
    const progress = sharedValues.mock.results[0].value;
    fireEvent.press(screen.getByTestId('open'));
    fireEvent(screen.getByTestId('hero-cover-card').parent!, 'layout');
    fireEvent(screen.getByTestId('flying-cover-image', { includeHiddenElements: true }), 'load');
    progress.value = 1;
    act(() => {
      timing.mock.calls[0][2]?.(true);
    });
    expect(screen.getByTestId('state').props.children).toBe('e1:retained');
    expect(opacityOf(screen.getByTestId('hero-cover-card'))).toBe(1);
    // The return timing starts before its closing commit: progress alone hides the cover.
    progress.value = 0.9;
    screen.rerender(
      <EventSharedTransitionProvider>
        <Harness />
      </EventSharedTransitionProvider>,
    );
    expect(screen.getByTestId('state').props.children).toBe('e1:retained');
    expect(opacityOf(screen.getByTestId('hero-cover-card'))).toBe(0);
  });
});
