import React from 'react';

import { Text } from 'react-native';

import { render, waitFor } from '@testing-library/react-native';
import { Gesture } from 'react-native-gesture-handler';
import * as Reanimated from 'react-native-reanimated';

import AnimatedPager from '../AnimatedPager';

type MockPanGesture = {
  enabled: jest.Mock;
  onUpdate: jest.Mock;
  onEnd: jest.Mock;
};

const latestPanGesture = (): MockPanGesture => {
  const panMock = Gesture.Pan as jest.Mock;
  const latestResult = panMock.mock.results[panMock.mock.results.length - 1];

  if (!latestResult) {
    throw new Error('Expected AnimatedPager to create a pan gesture');
  }

  return latestResult.value as MockPanGesture;
};

describe('AnimatedPager', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('hides inactive pages from accessibility', () => {
    const { UNSAFE_getAllByType } = render(
      <AnimatedPager selectedIndex={1} onPageChange={jest.fn()}>
        <Text testID="page-0">Upcoming</Text>
        <Text testID="page-1">Newest</Text>
      </AnimatedPager>,
    );

    const [inactivePage, activePage] = UNSAFE_getAllByType(Text);

    expect(inactivePage.parent?.props.accessibilityElementsHidden).toBe(true);
    expect(inactivePage.parent?.props.importantForAccessibility).toBe('no-hide-descendants');
    expect(activePage.parent?.props.accessibilityElementsHidden).toBe(false);
    expect(activePage.parent?.props.importantForAccessibility).toBe('auto');
  });

  it('accepts a new swipe while the previous settle spring is still running', () => {
    const withSpringSpy = jest
      .spyOn(Reanimated, 'withSpring')
      .mockImplementation((toValue) => toValue);
    const onPageChange = jest.fn();

    const Harness = () => {
      const [selectedIndex, setSelectedIndex] = React.useState(0);

      const handlePageChange = (index: number) => {
        onPageChange(index);
        setSelectedIndex(index);
      };

      return (
        <AnimatedPager selectedIndex={selectedIndex} onPageChange={handlePageChange}>
          <Text>Upcoming</Text>
          <Text>Newest</Text>
        </AnimatedPager>
      );
    };

    const { rerender } = render(<Harness />);
    let gesture = latestPanGesture();
    const firstUpdate = gesture.onUpdate.mock.calls[0][0];
    const firstEnd = gesture.onEnd.mock.calls[0][0];

    firstUpdate({ translationX: -120 });
    firstEnd({ translationX: -120, velocityX: -900 });
    rerender(<Harness />);

    gesture = latestPanGesture();
    const secondUpdate = gesture.onUpdate.mock.calls[0][0];
    const secondEnd = gesture.onEnd.mock.calls[0][0];

    secondUpdate({ translationX: 120 });
    secondEnd({ translationX: 120, velocityX: 900 });

    expect(onPageChange.mock.calls).toEqual([[1], [0]]);
    expect(withSpringSpy).toHaveBeenCalledTimes(4);
  });

  it('refreshes the native gesture enabled state after tab focus changes', async () => {
    const { rerender } = render(
      <AnimatedPager selectedIndex={0} onPageChange={jest.fn()} isActive={false}>
        <Text>Upcoming</Text>
        <Text>Newest</Text>
      </AnimatedPager>,
    );
    const inactiveGesture = latestPanGesture();

    expect(inactiveGesture.enabled).toHaveBeenCalledWith(false);

    rerender(
      <AnimatedPager selectedIndex={0} onPageChange={jest.fn()} isActive>
        <Text>Upcoming</Text>
        <Text>Newest</Text>
      </AnimatedPager>,
    );
    await waitFor(() => {
      const activeGesture = latestPanGesture();
      expect(activeGesture).not.toBe(inactiveGesture);
      expect(activeGesture.enabled).toHaveBeenCalledWith(true);
    });
  });
});
