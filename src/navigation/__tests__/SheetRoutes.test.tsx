import { useState } from 'react';

import { Modal, Platform, Text } from 'react-native';

import { useIsFocused } from '@react-navigation/native';
import { render } from '@testing-library/react-native';

import { SheetRoute } from '../SheetRoutes';

jest.mock('@screens/EventDetailsScreen', () => () => null);
jest.mock('@screens/JoinRequestScreen', () => () => null);

const focused = jest.mocked(useIsFocused);
const initialPlatform = Platform.OS;

const StatefulContent = () => {
  const [value] = useState('Plan details');
  return <Text>{value}</Text>;
};

afterEach(() => {
  Platform.OS = initialPlatform;
  focused.mockReturnValue(true);
});

it('hides the Android native sheet while an editor or chat is above its route and restores it on return', () => {
  Platform.OS = 'android';
  focused.mockReturnValue(true);
  const content = () => (
    <SheetRoute onClose={jest.fn()}>
      <StatefulContent />
    </SheetRoute>
  );
  const view = render(content());
  expect(view.UNSAFE_getByType(Modal).props.visible).toBe(true);

  focused.mockReturnValue(false);
  view.rerender(content());
  expect(view.UNSAFE_getByType(Modal).props.visible).toBe(false);

  focused.mockReturnValue(true);
  view.rerender(content());
  expect(view.UNSAFE_getByType(Modal).props.visible).toBe(true);
  expect(view.getByText('Plan details')).toBeTruthy();
});

it('keeps the iOS sheet in the navigation stack rather than a native Android modal', () => {
  Platform.OS = 'ios';
  const view = render(
    <SheetRoute onClose={jest.fn()}>
      <Text>Plan details</Text>
    </SheetRoute>,
  );
  expect(view.UNSAFE_queryByType(Modal)).toBeNull();
  expect(view.getByText('Plan details')).toBeTruthy();
});
