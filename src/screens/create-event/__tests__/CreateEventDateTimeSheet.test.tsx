import React from 'react';

import { InteractionManager, Text } from 'react-native';

import { act, render } from '@testing-library/react-native';

import { BottomSheetHostProvider } from '@components/sheets';

import CreateEventDateTimeSheet from '../CreateEventDateTimeSheet';

const mockFocusContext = React.createContext(true);
jest.mock('@react-navigation/native', () => ({
  useIsFocused: () => React.useContext(mockFocusContext),
  useFocusEffect: (callback: () => () => void) => {
    const focused = React.useContext(mockFocusContext);
    React.useEffect(() => (focused ? callback() : undefined), [callback, focused]);
  },
}));

it('prepares only after navigation settles and releases native content on blur', () => {
  let settle: (() => void) | undefined;
  const cancel = jest.fn();
  const idle = jest
    .spyOn(InteractionManager, 'runAfterInteractions')
    .mockImplementation((callback) => {
      settle = callback as () => void;
      return { cancel, then: jest.fn(), done: jest.fn() };
    });
  const props = {
    visible: false,
    value: new Date(2026, 9, 5, 19, 59),
    minDate: new Date(2026, 9, 4, 12),
    maxDate: new Date(2026, 10, 3, 12),
    onClose: jest.fn(),
    onConfirm: jest.fn(),
  };
  const Harness = ({ focused = true }: { focused?: boolean }) => (
    <mockFocusContext.Provider value={focused}>
      <BottomSheetHostProvider>
        <Text>Form</Text>
        <CreateEventDateTimeSheet {...props} />
      </BottomSheetHostProvider>
    </mockFocusContext.Provider>
  );
  const view = render(<Harness />);
  expect(view.queryByText('Done', { includeHiddenElements: true })).toBeNull();
  act(() => settle?.());
  expect(view.getByText('Done', { includeHiddenElements: true })).toBeTruthy();
  expect(view.queryByText('Done')).toBeNull();
  expect(view.getByText('Form')).toBeTruthy();
  view.rerender(<Harness focused={false} />);
  expect(cancel).toHaveBeenCalled();
  expect(view.queryByText('Done', { includeHiddenElements: true })).toBeNull();
  view.rerender(<Harness />);
  expect(view.queryByText('Done', { includeHiddenElements: true })).toBeNull();
  act(() => settle?.());
  expect(view.getByText('Done', { includeHiddenElements: true })).toBeTruthy();
  view.unmount();
  idle.mockRestore();
});

it('an early tap opens immediately without waiting for the preparation callback', () => {
  const idle = jest
    .spyOn(InteractionManager, 'runAfterInteractions')
    .mockImplementation(() => ({ cancel: jest.fn(), then: jest.fn(), done: jest.fn() }));
  const props = {
    visible: true,
    value: new Date(2026, 9, 5, 19, 59),
    minDate: new Date(2026, 9, 4, 12),
    maxDate: new Date(2026, 10, 3, 12),
    onClose: jest.fn(),
    onConfirm: jest.fn(),
  };
  const view = render(
    <BottomSheetHostProvider>
      <CreateEventDateTimeSheet {...props} />
    </BottomSheetHostProvider>,
  );
  expect(view.getByText('Done')).toBeTruthy();
  view.unmount();
  idle.mockRestore();
});
