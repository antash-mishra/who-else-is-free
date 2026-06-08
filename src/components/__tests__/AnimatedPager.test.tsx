import React from 'react';

import { Text } from 'react-native';

import { render } from '@testing-library/react-native';

import AnimatedPager from '../AnimatedPager';

describe('AnimatedPager', () => {
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
});
