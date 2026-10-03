import React from 'react';

import { ScrollView, StyleSheet } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';
import { Image } from 'expo-image';
import * as Reanimated from 'react-native-reanimated';

import { resetPlacedIds } from '@components/motion';

import EventDetailsHero from '../EventDetailsHero';

describe('EventDetailsHero', () => {
  beforeEach(() => {
    resetPlacedIds();
    jest.restoreAllMocks();
  });

  it('renders without a scroll value', () => {
    const { getByTestId } = render(
      <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} />,
    );
    expect(getByTestId('hero-cover-card')).toBeTruthy();
  });

  it('renders inside a scrolling page', () => {
    const { getByTestId } = render(
      <ScrollView>
        <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} />
      </ScrollView>,
    );
    expect(getByTestId('hero-cover-card')).toBeTruthy();
  });

  it('shows the first cover at final size and opacity without an entry transform', () => {
    const { getByTestId } = render(
      <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} />,
    );
    const style = StyleSheet.flatten(getByTestId('hero-cover-card').props.style);
    expect(style?.transform ?? []).toEqual([]);
    expect(style?.opacity ?? 1).toBe(1);
  });

  it('disables image transitions for both the cover and blurred backdrop', () => {
    const { UNSAFE_getAllByType } = render(
      <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} />,
    );
    const images = UNSAFE_getAllByType(Image);
    expect(images).toHaveLength(2);
    for (const image of images) expect(image.props.transition).toBe(0);
  });

  it('does not move the cover or backdrop independently of scrolled content', () => {
    const onScroll = jest.fn();
    const { getByTestId, UNSAFE_getAllByType } = render(
      <ScrollView testID="hero-page" onScroll={onScroll}>
        <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} />
      </ScrollView>,
    );
    fireEvent.scroll(getByTestId('hero-page'), {
      nativeEvent: { contentOffset: { x: 0, y: 100 } },
    });
    expect(onScroll).toHaveBeenCalledTimes(1);
    const backdrop = UNSAFE_getAllByType(Image)[0];
    expect(StyleSheet.flatten(backdrop.props.style)?.transform ?? []).toEqual([]);
    const cover = getByTestId('hero-cover-card');
    expect(StyleSheet.flatten(cover.props.style)?.transform ?? []).toEqual([]);
  });

  it.each([false, true])('stays static across remounts with reduced motion %s', (reducedMotion) => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(reducedMotion);
    const spring = jest.spyOn(Reanimated, 'withSpring');
    for (const imageUri of [
      'https://example.test/a.jpg',
      'https://example.test/a.jpg',
      'https://example.test/b.jpg',
    ]) {
      const view = render(<EventDetailsHero imageUri={imageUri} topInset={30} />);
      const style = StyleSheet.flatten(view.getByTestId('hero-cover-card').props.style);
      expect(style?.transform ?? []).toEqual([]);
      expect(style?.opacity ?? 1).toBe(1);
      expect(style).toMatchObject({ width: '60%', aspectRatio: 1 });
      const images = view.UNSAFE_getAllByType(Image);
      expect(images.map((image) => image.props.source)).toEqual([
        { uri: imageUri },
        { uri: imageUri },
      ]);
      expect(images[0].props.blurRadius).toBe(28);
      view.unmount();
    }
    expect(spring).not.toHaveBeenCalled();
  });
});
