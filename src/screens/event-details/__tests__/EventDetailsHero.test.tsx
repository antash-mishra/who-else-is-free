import React from 'react';

import { render } from '@testing-library/react-native';
import { useSharedValue } from 'react-native-reanimated';

import { resetPlacedIds } from '@components/motion';

import EventDetailsHero from '../EventDetailsHero';

const Harness = () => {
  const scrollY = useSharedValue(0);
  return <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} scrollY={scrollY} />;
};

describe('EventDetailsHero', () => {
  beforeEach(() => {
    resetPlacedIds();
  });

  it('renders without a scroll value', () => {
    const { getByTestId } = render(
      <EventDetailsHero imageUri="https://example.test/a.jpg" topInset={0} />,
    );
    expect(getByTestId('hero-cover-card')).toBeTruthy();
  });

  it('renders with a scroll value', () => {
    const { getByTestId } = render(<Harness />);
    expect(getByTestId('hero-cover-card')).toBeTruthy();
  });
});
