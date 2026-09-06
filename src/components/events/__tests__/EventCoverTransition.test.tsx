import React from 'react';

import { Pressable, View } from 'react-native';

import { act, fireEvent, render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import { eventCoverMotion } from '@theme/motion';

import { EventCoverTransitionProvider, useEventCoverTransition } from '../EventCoverTransition';

const navigate = jest.fn();
const measure = jest.fn();
const sourceRef = { current: { measureInWindow: measure } as unknown as View };
const Harness = () => {
  const { open, activeEventId } = useEventCoverTransition();
  return (
    <Pressable
      testID="open-cover"
      accessibilityLabel={activeEventId ?? 'idle'}
      onPress={() => open('event-1', 'https://example.test/cover.jpg', sourceRef, navigate)}
    />
  );
};

const mount = () =>
  render(
    <EventCoverTransitionProvider>
      <Harness />
    </EventCoverTransitionProvider>,
    {
      createNodeMock: () => ({
        measureInWindow: (callback: (x: number, y: number) => void) => callback(0, 24),
      }),
    },
  );

describe('event cover navigation handoff', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    navigate.mockReset();
    measure.mockReset();
    jest
      .spyOn(View.prototype, 'measureInWindow')
      .mockImplementation((callback) => callback(0, 24, 400, 800));
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(false);
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('keeps ordinary navigation working outside the provider', () => {
    const screen = render(<Harness />);
    fireEvent.press(screen.getByTestId('open-cover'));
    expect(navigate).toHaveBeenCalledWith(false);
  });

  it('uses a stationary page fade for reduced motion without measuring', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const screen = mount();
    fireEvent.press(screen.getByTestId('open-cover'));
    expect(navigate).toHaveBeenCalledWith(true);
    expect(measure).not.toHaveBeenCalled();
  });

  it('falls back once if a recycled source never supplies its measurement', () => {
    const screen = mount();
    fireEvent.press(screen.getByTestId('open-cover'));
    act(() => {
      jest.advanceTimersByTime(eventCoverMotion.measureTimeoutMs);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith(false);
    act(() => {
      measure.mock.calls[0][0](16, 200, 80, 80);
    });
    expect(navigate).toHaveBeenCalledTimes(1);
  });

  it('rejects zero-size source measurements', () => {
    measure.mockImplementation((callback) => callback(0, 0, 0, 0));
    const screen = mount();
    fireEvent.press(screen.getByTestId('open-cover'));
    expect(navigate).toHaveBeenCalledWith(false);
  });

  it('starts one flight and releases it if the destination never arrives', () => {
    measure.mockImplementation((callback) => callback(16, 200, 80, 80));
    const screen = mount();
    fireEvent.press(screen.getByTestId('open-cover'));
    expect(navigate).toHaveBeenCalledWith(true);
    expect(screen.getByTestId('open-cover').props.accessibilityLabel).toBe('event-1');
    fireEvent.press(screen.getByTestId('open-cover'));
    expect(navigate).toHaveBeenCalledTimes(1);
    act(() => {
      jest.advanceTimersByTime(eventCoverMotion.timeoutMs);
    });
    expect(screen.getByTestId('open-cover').props.accessibilityLabel).toBe('idle');
  });
});
