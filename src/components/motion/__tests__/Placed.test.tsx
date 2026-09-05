import React from 'react';

import { Text } from 'react-native';

import { render } from '@testing-library/react-native';
import * as Reanimated from 'react-native-reanimated';

import Placed, { resetPlacedIds } from '../Placed';

describe('Placed', () => {
  beforeEach(() => {
    resetPlacedIds();
    jest.restoreAllMocks();
  });

  it('renders its children', () => {
    const { getByText } = render(
      <Placed id="a">
        <Text>Card</Text>
      </Placed>,
    );
    expect(getByText('Card')).toBeTruthy();
  });

  it('animates the first time an id is placed', () => {
    const spring = jest.spyOn(Reanimated, 'withSpring');
    render(
      <Placed id="first">
        <Text>Card</Text>
      </Placed>,
    );
    expect(spring).toHaveBeenCalled();
  });

  it('does not re-animate an id that has already been placed', () => {
    render(
      <Placed id="repeat">
        <Text>Card</Text>
      </Placed>,
    );
    const spring = jest.spyOn(Reanimated, 'withSpring');
    render(
      <Placed id="repeat">
        <Text>Card</Text>
      </Placed>,
    );
    expect(spring).not.toHaveBeenCalled();
  });

  it('skips animation entirely when reduce motion is on', () => {
    jest.spyOn(Reanimated, 'useReducedMotion').mockReturnValue(true);
    const spring = jest.spyOn(Reanimated, 'withSpring');
    const { getByText } = render(
      <Placed id="reduced">
        <Text>Card</Text>
      </Placed>,
    );
    expect(getByText('Card')).toBeTruthy();
    expect(spring).not.toHaveBeenCalled();
  });
});
