import React from 'react';

import { AppState, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { NavigationContext } from '@react-navigation/native';
import { act, fireEvent, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { fallbackSharedCoverScreenOptions } from '@navigation/transitions';
import { eventSharedMotion, heroCoverSize } from '@theme/motion';

import {
  EventSharedTransitionPage,
  EventSharedTransitionProvider,
  EventSharedTransitionSourcePage,
  useEventSharedTransition,
  useEventSharedTransitionState,
} from '../EventSharedTransition';

const navigate = jest.fn();
const measureCover = jest.fn();
const measureTitle = jest.fn();
const closed = jest.fn();
const destinationRef = {
  current: {
    measureInWindow: (callback: (x: number, y: number, w: number, h: number) => void) =>
      callback(92, 103, 228, 228),
  } as unknown as View,
};
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
  const { open, prime, land, cancel, close, progress } = useEventSharedTransition();
  const state = useEventSharedTransitionState();
  return (
    <>
      <Text testID="progress">{progress.value}</Text>
      <Text testID="state">{`${state.eventId ?? 'idle'}:${state.phase ?? 'none'}`}</Text>
      <Pressable testID="close" onPress={() => close('event-1', closed)} />
      <Pressable testID="cancel" onPress={() => cancel()} />
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
        onPress={() =>
          land('event-1', 'cover', heroFrame, { rotation: 1.2, coverRef: destinationRef })
        }
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
  it('keeps opening unblurred while preserving the return radius and cleanup threshold', () => {
    const osDescriptor = Object.getOwnPropertyDescriptor(Platform, 'OS');
    const versionDescriptor = Object.getOwnPropertyDescriptor(Platform, 'Version');
    Object.defineProperty(Platform, 'OS', { configurable: true, value: 'android' });
    Object.defineProperty(Platform, 'Version', { configurable: true, value: 31 });
    try {
      const timing = holdAnimations();
      const sharedValues = jest.spyOn(Reanimated, 'useSharedValue');
      const derivedValues = jest.spyOn(Reanimated, 'useDerivedValue');
      measureCard();
      const screen = render(
        <EventSharedTransitionProvider>
          <EventSharedTransitionSourcePage>
            <Harness />
          </EventSharedTransitionSourcePage>
        </EventSharedTransitionProvider>,
      );
      const progress = sharedValues.mock.results[0].value;
      const blurRadius = () => derivedValues.mock.calls[derivedValues.mock.calls.length - 1][0]();
      expect(blurRadius()).toBe(0);
      fireEvent.press(screen.getByTestId('open'));
      expect(blurRadius()).toBe(0); // Landing never blurs the source.
      fireEvent.press(screen.getByTestId('land-cover'));
      fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
      progress.value = 0.04;
      expect(blurRadius()).toBe(0);
      progress.value = 0.041;
      expect(blurRadius()).toBe(0);
      progress.value = 0.5;
      expect(blurRadius()).toBe(0);
      progress.value = 1;
      act(() => {
        timing.mock.calls[0][2]?.(true);
      });
      expect(blurRadius()).toBe(0); // Idle after completed opening.
      fireEvent.press(screen.getByTestId('close'));
      expect(blurRadius()).toBe(0); // Returning bitmap preparation.
      fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
      progress.value = 1;
      expect(blurRadius()).toBe(4); // Preserve full blur from the start of return.
      progress.value = 0.041;
      expect(blurRadius()).toBe(4);
      progress.value = 0.04;
      expect(blurRadius()).toBe(0);
      expect(screen.getByTestId('state').props.children).toBe('event-1:closing');
      expect(closed).not.toHaveBeenCalled();
      fireEvent.press(screen.getByTestId('cancel'));
      expect(blurRadius()).toBe(0); // Cancellation restores an unblurred feed.
    } finally {
      if (osDescriptor) Object.defineProperty(Platform, 'OS', osDescriptor);
      if (versionDescriptor) Object.defineProperty(Platform, 'Version', versionDescriptor);
    }
  });

  beforeEach(() => {
    jest.useFakeTimers();
    navigate.mockReset();
    closed.mockReset();
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

  it('remeasures the source and reverses before completing navigation', () => {
    const timing = holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    act(() => {
      timing.mock.calls[0][2]?.(true);
    });
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    fireEvent.press(screen.getByTestId('close'));
    expect(screen.getByTestId('state').props.children).toBe('event-1:returning');
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    expect(screen.getByTestId('state').props.children).toBe('event-1:closing');
    expect(measureCover).toHaveBeenCalledTimes(2);
    expect(closed).not.toHaveBeenCalled();
    fireEvent.press(screen.getByTestId('close'));
    expect(measureCover).toHaveBeenCalledTimes(2);
    expect(timing.mock.calls[1][0]).toBe(0);
    // Re-evaluate the mocked animated style at the endpoint; the Jest mock
    // does not run a native worklet when the shared value changes.
    screen.rerender(
      <EventSharedTransitionProvider>
        <Harness />
      </EventSharedTransitionProvider>,
    );
    // The JS completion has not run: the page must already be hidden.
    expect(pageOpacity(screen)).toBe(0);
    act(() => {
      timing.mock.calls[1][2]?.(true);
    });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state').props.children).toBe('event-1:closed');
    // Simulate the Details unmount cleanup while native source worklets can
    // still hold the closing props. Its endpoint must not jump back to 1.
    fireEvent.press(screen.getByTestId('cancel'));
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    expect(screen.getByTestId('progress').props.children).toBe(0);
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledTimes(2);
  });

  it.each([true, false, 'unmount'])(
    'skips the redundant stack close only after a completed return (%s)',
    (completeReturn) => {
      const timing = holdAnimations();
      measureCard();
      let beforeRemove: (event: { data: { action: object }; preventDefault: () => void }) => void;
      const setOptions = jest.fn();
      const dispatch = jest.fn(() => {
        if (completeReturn) expect(setOptions).not.toHaveBeenCalled();
        else expect(setOptions).toHaveBeenCalledWith(fallbackSharedCoverScreenOptions);
      });
      const navigation = {
        addListener: (_name: string, listener: typeof beforeRemove) => {
          beforeRemove = listener;
          return () => undefined;
        },
        setOptions,
        dispatch,
      };
      const screen = render(
        <NavigationContext.Provider value={navigation as never}>
          <EventSharedTransitionProvider>
            <Harness />
          </EventSharedTransitionProvider>
        </NavigationContext.Provider>,
        {
          createNodeMock: () => ({
            measureInWindow: (callback: (x: number, y: number) => void) => callback(0, 24),
          }),
        },
      );
      fireEvent.press(screen.getByTestId('open'));
      fireEvent.press(screen.getByTestId('land-cover'));
      fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
      act(() => {
        timing.mock.calls[0][2]?.(true);
      });
      const action = { type: 'GO_BACK' };
      const preventDefault = jest.fn();
      act(() => {
        beforeRemove({ data: { action }, preventDefault });
      });
      expect(preventDefault).toHaveBeenCalledTimes(1);
      expect(dispatch).not.toHaveBeenCalled();
      if (completeReturn === 'unmount') {
        screen.unmount();
        act(() => {
          jest.advanceTimersByTime(1000);
        });
        expect(dispatch).not.toHaveBeenCalled();
        return;
      }
      if (completeReturn) {
        fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
        act(() => {
          timing.mock.calls[1][2]?.(true);
        });
      } else {
        act(() => {
          jest.advanceTimersByTime(eventSharedMotion.imageGraceMs);
        });
        expect(dispatch).not.toHaveBeenCalled();
        // A second Back while the fallback options commit must not queue
        // another navigation action.
        act(() => {
          beforeRemove({ data: { action }, preventDefault });
        });
        act(() => {
          jest.advanceTimersByTime(40);
        });
      }
      expect(dispatch).toHaveBeenCalledTimes(1);
      expect(dispatch).toHaveBeenCalledWith(action);
    },
  );

  it('does not dispatch a delayed fallback after its page has been removed', () => {
    let beforeRemove: (event: { data: { action: object }; preventDefault: () => void }) => void;
    const dispatch = jest.fn();
    const navigation = {
      addListener: (_name: string, listener: typeof beforeRemove) => {
        beforeRemove = listener;
        return () => undefined;
      },
      setOptions: jest.fn(),
      dispatch,
    };
    const screen = render(
      <NavigationContext.Provider value={navigation as never}>
        <EventSharedTransitionPage eventId="event-1">
          <View />
        </EventSharedTransitionPage>
      </NavigationContext.Provider>,
    );
    act(() => {
      beforeRemove({ data: { action: { type: 'GO_BACK' } }, preventDefault: jest.fn() });
    });
    expect(navigation.setOptions).toHaveBeenCalledWith(fallbackSharedCoverScreenOptions);
    screen.unmount();
    act(() => {
      jest.advanceTimersByTime(40);
    });
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('keeps return image preparation bounded and completes a repeated back only once', () => {
    const timing = holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    act(() => {
      timing.mock.calls[0][2]?.(true);
    });
    fireEvent.press(screen.getByTestId('close'));
    fireEvent.press(screen.getByTestId('close'));
    expect(screen.getByTestId('state').props.children).toBe('event-1:returning');
    expect(closed).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.imageGraceMs);
    });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    expect(timing).toHaveBeenCalledTimes(1);
  });

  it('falls back when the return source is recycled, without trapping navigation', () => {
    const timing = holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    act(() => {
      timing.mock.calls[0][2]?.(true);
    });
    measureCover.mockImplementation(() => undefined);
    fireEvent.press(screen.getByTestId('close'));
    act(() => {
      jest.advanceTimersByTime(eventSharedMotion.measureTimeoutMs);
    });
    expect(closed).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
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

  it('waits for the cover bitmap, then flies only the image', () => {
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
    expect(screen.queryByTestId('flying-title', hidden)).toBeNull();
    expect(measureTitle).not.toHaveBeenCalled();

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
    expect(measureTitle).not.toHaveBeenCalled();
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
    const page = screen.getByTestId('page');
    expect(StyleSheet.flatten(page.props.style).transform).toEqual([
      { translateX: 0 },
      { translateY: 0 },
      { scaleX: 1 },
      { scaleY: 1 },
    ]);
    expect(StyleSheet.flatten(page.props.children.props.style).opacity).toBe(1);
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
    expect(screen.queryByTestId('flying-title', hidden)).toBeNull();
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
  it('ignores callbacks from a cancelled flight after the same event reopens', () => {
    holdAnimations();
    measureCard();
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    const oldImage = screen.getByTestId('flying-cover-image', hidden);
    const oldError = oldImage.props.onError;
    const oldLoad = oldImage.props.onLoad;
    fireEvent.press(screen.getByTestId('cancel'));
    fireEvent.press(screen.getByTestId('open'));
    act(() => {
      oldError();
      oldLoad();
    });
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-title'));
    expect(screen.getByTestId('state').props.children).toBe('event-1:landing');
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    expect(screen.getByTestId('state').props.children).toBe('event-1:flying');
  });

  it('does not navigate from a pending measurement after backgrounding', () => {
    const listener = jest.spyOn(AppState, 'addEventListener');
    measureTitle.mockImplementation((callback) => callback(112, 224, 280, 20));
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    act(() => {
      listener.mock.calls.forEach(([, callback]) => callback('background'));
      measureCover.mock.calls[0][0](16, 200, 80, 80);
      jest.advanceTimersByTime(eventSharedMotion.measureTimeoutMs + 1);
    });
    expect(navigate).not.toHaveBeenCalled();
    measureCard();
    act(() => listener.mock.calls.forEach(([, callback]) => callback('active')));
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('restores visible content and accepts another tap after an interrupted flight', () => {
    holdAnimations();
    measureCard();
    const listener = jest.spyOn(AppState, 'addEventListener');
    const screen = mount();
    fireEvent.press(screen.getByTestId('open'));
    fireEvent.press(screen.getByTestId('land-cover'));
    fireEvent.press(screen.getByTestId('land-title'));
    fireEvent(screen.getByTestId('flying-cover-image', hidden), 'load');
    act(() => listener.mock.calls.forEach(([, callback]) => callback('background')));
    expect(screen.getByTestId('state').props.children).toBe('idle:none');
    expect(pageOpacity(screen)).toBe(1);
    act(() => listener.mock.calls.forEach(([, callback]) => callback('active')));
    fireEvent.press(screen.getByTestId('open'));
    expect(navigate).toHaveBeenCalledTimes(2);
  });
});
