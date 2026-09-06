import React from 'react';

import { Pressable, StyleSheet, Text, View } from 'react-native';

import { act, fireEvent, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { eventSharedMotion, heroCoverSize } from '@theme/motion';

import {
  EventSharedTransitionPage,
  EventSharedTransitionProvider,
  useEventSharedTransition,
  useEventSharedTransitionState,
} from '../EventSharedTransition';

const navigate = jest.fn();
const measureCover = jest.fn();
const measureTitle = jest.fn();
const source = {
  imageUri: 'https://example.test/cover.jpg',
  title: 'Pub quiz',
  titleStyle: { fontSize: 17 },
  coverRef: { current: { measureInWindow: measureCover } as unknown as View },
  titleRef: { current: { measureInWindow: measureTitle } as unknown as Text },
};
const heroFrame = { x: 92, y: 103, width: 228, height: 228 };
const titleFrame = { x: 16, y: 420, width: 380, height: 36 };

const Harness = ({ secondPage = false }: { secondPage?: boolean }) => {
  const { open, prime, land } = useEventSharedTransition();
  const state = useEventSharedTransitionState();
  return (
    <>
      <Text testID="state">{`${state.eventId ?? 'idle'}:${state.phase ?? 'none'}`}</Text>
      <Pressable testID="prime" onPress={() => prime('event-1', source)} />
      <Pressable testID="open" onPress={() => open('event-1', source, navigate)} />
      <Pressable
        testID="land-foreign"
        onPress={() => land('event-2', 'cover', heroFrame, { rotation: 1.2 })}
      />
      {secondPage ? (
        <EventSharedTransitionPage eventId="event-2" enabled testID="page-2">
          <View />
        </EventSharedTransitionPage>
      ) : null}
      <Pressable
        testID="land-cover"
        onPress={() => land('event-1', 'cover', heroFrame, { rotation: 1.2 })}
      />
      <Pressable
        testID="land-title"
        onPress={() => land('event-1', 'title', titleFrame, { titleStyle: { fontSize: 29 } })}
      />
      <EventSharedTransitionPage eventId="event-1" enabled testID="page">
        <View />
      </EventSharedTransitionPage>
    </>
  );
};

const mount = (secondPage = false) =>
  render(
    <EventSharedTransitionProvider>
      <Harness secondPage={secondPage} />
    </EventSharedTransitionProvider>,
    {
      createNodeMock: () => ({
        measureInWindow: (callback: (x: number, y: number) => void) => callback(0, 24),
      }),
    },
  );

const pageOpacity = (screen: ReturnType<typeof mount>) =>
  StyleSheet.flatten(screen.getByTestId('page').props.style).opacity;

// The overlay is hidden from accessibility, so RNTL's default queries skip it.
const hidden = { includeHiddenElements: true };

const measureCard = () => {
  measureCover.mockImplementation((callback) => callback(16, 224, 80, 80));
  measureTitle.mockImplementation((callback) => callback(112, 224, 280, 20));
};

/** Keep flights in the air: the Reanimated mock otherwise completes timing instantly. */
const holdAnimations = () =>
  jest.spyOn(Reanimated, 'withTiming').mockImplementation((value: unknown) => value as never);

describe('event shared transition', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigate.mockReset();
    measureCover.mockReset();
    measureTitle.mockReset();
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation((callback) => callback(0, 24, 400, 800));
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(false);
  });
  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('keeps ordinary navigation working outside the provider', () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledWith(false);
    expect(pageOpacity(screen)).toBe(1);
  });

  it('uses a stationary page fade for reduced motion without measuring', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledWith(true);
    expect(measureCover).not.toHaveBeenCalled();
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    // The page fades itself in; the mocked timing lands immediately, visible on the next render.
    screen.rerender(
      <EventSharedTransitionProvider>
        <Harness />
      </EventSharedTransitionProvider>,
    );
    expect(pageOpacity(screen)).toBe(1);
  });

  it('falls back once if a recycled source never supplies its measurement', () => {
    measureTitle.mockImplementation((callback) => callback(112, 224, 280, 20));
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.measureTimeoutMs);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(false);
    act(() => {
      measureCover.mock.calls[0][0](16, 200, 80, 80);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
  });

  it('rejects zero-size cover measurements', () => {
    measureCover.mockImplementation((callback) => callback(0, 0, 0, 0));
    measureTitle.mockImplementation((callback) => callback(112, 224, 280, 20));
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledWith(false);
    expect(pageOpacity(screen)).toBe(1);
  });

  it('hides the page until the cover and title have landed, then flies both', () => {
    holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    expect(pageOpacity(screen)).toBe(0);
    expect(screen.queryByTestId('flying-title', hidden)).toBeNull();

    fireEvent.press(screen.getByTestId('land-cover'));
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    fireEvent.press(screen.getByTestId('land-title'));
    // Both landed; take-off still waits for the cover bitmap.
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    expect(screen.getByTestId('state').props.children).toBe('event-1:flying');
    expect(screen.getByTestId('flying-cover', hidden)).toBeTruthy();
    expect(screen.getByTestId('flying-title', hidden)).toBeTruthy();

    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('flies the cover alone when the title never reports a frame', () => {
    holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.titleGraceMs);
    });
    expect(screen.getByTestId('state').props.children).toBe('event-1:flying');
    expect(screen.getByTestId('flying-cover', hidden)).toBeTruthy();
    expect(screen.queryByTestId('flying-title', hidden)).toBeNull();
  });

  it('reveals the page and releases the tap if the destination never lands', () => {
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    expect(pageOpacity(screen)).toBe(0);
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.landTimeoutMs);
    });
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    expect(pageOpacity(screen)).toBe(1);
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it('releases a flight that never completes', () => {
    holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-title'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    expect(screen.getByTestId('state').props.children).toBe('event-1:flying');
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.timeoutMs);
    });
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    expect(screen.queryByTestId('flying-cover', hidden)).toBeNull();
    expect(pageOpacity(screen)).toBe(1);
  });

  it('hands off to the page once the flight completes', () => {
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-title'));
    // Landed, but take-off waits for the cover bitmap (or its grace).
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    expect(screen.queryByTestId('flying-cover', hidden)).toBeNull();
    expect(pageOpacity(screen)).toBe(1);
  });

  it('takes off after the image grace even if the bitmap never reports', () => {
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-title'));
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.imageGraceMs);
    });
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
  });

  it('starts the timing exactly once even when frames land twice', () => {
    const timing = holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-title'));
    fireEvent.press(screen.getByTestId('land-title'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.imageGraceMs);
    });
    expect(timing).toHaveBeenCalledTimes(1);
  });

  it('places the overlays on the card at take-off', () => {
    holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-title'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    const layoutSize = heroCoverSize(750);
    const cover = StyleSheet.flatten(screen.getByTestId('flying-cover', hidden).props.style);
    expect(cover.left).toBe(16 + 40 - layoutSize / 2);
    expect(cover.top).toBe(200 + 40 - layoutSize / 2);
    expect(cover.width).toBe(layoutSize);
    const scale = 80 / layoutSize;
    expect(cover.transform).toEqual([
      { translateX: expect.closeTo(0) },
      { translateY: expect.closeTo(0) },
      { scale },
      { rotate: '0deg' },
    ]);
    expect(cover.borderRadius).toBeCloseTo(eventSharedMotion.cardRadius / scale);
    const title = StyleSheet.flatten(screen.getByTestId('flying-title', hidden).props.style);
    expect(title.left).toBe(112);
    expect(title.top).toBe(200);
    expect(title.width).toBe(titleFrame.width);
    expect(title.fontSize).toBe(29);
    expect(title.transform).toEqual([
      { translateX: expect.closeTo(0) },
      { translateY: expect.closeTo(0) },
      { scale: 17 / 29 },
    ]);
  });

  it('releases the flight when the cover image fails to load', () => {
    holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'error');
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    expect(pageOpacity(screen)).toBe(1);
  });

  it('ignores frames reported for another event', () => {
    holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-foreign'));
    fireEvent.press(screen.getByTestId('land-title'));
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
  });

  it('only releases the flight when its own page unmounts', () => {
    holdAnimations();
    measureCard();
    const screen = mount(true);
    fireEvent.press(screen.getByTestId('open'));
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    screen.rerender(
      <EventSharedTransitionProvider>
        <Harness secondPage={false} />
      </EventSharedTransitionProvider>,
    );
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    screen.unmount();
  });

  it('reuses a fresh press-in measurement instead of measuring on press', () => {
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('prime'));
    expect(measureCover).toHaveBeenCalledTimes(1);
    fireEvent.press(screen.getByTestId('open'));
    expect(measureCover).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(true);
  });

  it('measures again when the primed frames are stale', () => {
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('prime'));
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.primedFrameTtlMs + 1);
    });
    fireEvent.press(screen.getByTestId('open'));
    expect(measureCover).toHaveBeenCalledTimes(2);
    expect(navigate).toHaveBeenCalledWith(true);
  });
});
