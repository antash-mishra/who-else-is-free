import React, { useState } from 'react';

import { BackHandler, Modal, Pressable, Text, View } from 'react-native';

import { act, fireEvent, render, waitFor } from '@testing-library/react-native';

import BottomSheetModal from '../BottomSheetModal';
import { BottomSheet, BottomSheetHostProvider } from '../sheets';

const HostHarness = ({ onSecondClose = jest.fn() }: { onSecondClose?: jest.Mock }) => {
  const [showFirst, setShowFirst] = useState(false);
  const [showSecond, setShowSecond] = useState(false);

  return (
    <BottomSheetHostProvider>
      <View>
        <Pressable testID="show-first" onPress={() => setShowFirst(true)}>
          <Text>Show First</Text>
        </Pressable>
        <Pressable testID="hide-first" onPress={() => setShowFirst(false)}>
          <Text>Hide First</Text>
        </Pressable>
        <Pressable testID="show-second" onPress={() => setShowSecond(true)}>
          <Text>Show Second</Text>
        </Pressable>
      </View>
      <BottomSheetModal visible={showFirst} onClose={() => setShowFirst(false)}>
        <Text>First sheet</Text>
      </BottomSheetModal>
      <BottomSheetModal
        visible={showSecond}
        onClose={() => {
          onSecondClose();
          setShowSecond(false);
        }}
      >
        <Text>Second sheet</Text>
      </BottomSheetModal>
    </BottomSheetHostProvider>
  );
};

describe('BottomSheetHostProvider', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('presents a sheet through the shared host', async () => {
    const { getByTestId, getByText } = render(<HostHarness />);

    fireEvent.press(getByTestId('show-first'));

    await waitFor(() => {
      expect(getByText('First sheet')).toBeTruthy();
    });
  });

  it('replaces sheet content without mounting a second native modal', async () => {
    const { getByTestId, getByText, queryAllByTestId, queryByText } = render(<HostHarness />);

    fireEvent.press(getByTestId('show-first'));

    await waitFor(() => {
      expect(getByText('First sheet')).toBeTruthy();
    });

    fireEvent.press(getByTestId('show-second'));

    await waitFor(() => {
      expect(getByText('Second sheet')).toBeTruthy();
    });
    expect(queryByText('First sheet')).toBeNull();
    expect(queryAllByTestId('bottom-sheet-modal')).toHaveLength(1);
  });

  it('ignores stale dismissals from a previous sheet owner', async () => {
    const { getByTestId, getByText } = render(<HostHarness />);

    fireEvent.press(getByTestId('show-first'));

    await waitFor(() => {
      expect(getByText('First sheet')).toBeTruthy();
    });

    fireEvent.press(getByTestId('show-second'));

    await waitFor(() => {
      expect(getByText('Second sheet')).toBeTruthy();
    });

    fireEvent.press(getByTestId('hide-first'));

    await waitFor(() => {
      expect(getByText('Second sheet')).toBeTruthy();
    });
  });

  it('delegates backdrop close to the current sheet onClose handler', async () => {
    const onSecondClose = jest.fn();
    const { getByTestId, getByText } = render(<HostHarness onSecondClose={onSecondClose} />);

    fireEvent.press(getByTestId('show-second'));

    await waitFor(() => {
      expect(getByText('Second sheet')).toBeTruthy();
    });

    fireEvent.press(getByTestId('bottom-sheet-backdrop'));

    expect(onSecondClose).toHaveBeenCalledTimes(1);
  });
});

describe('inline hosted sheets', () => {
  const InlineHarness = ({ onClose = jest.fn() }: { onClose?: jest.Mock }) => {
    const [visible, setVisible] = useState(true);
    return (
      <BottomSheetHostProvider>
        <Text>Underlying screen</Text>
        <BottomSheetModal
          visible={visible}
          presentation="inline"
          onClose={() => {
            onClose();
            setVisible(false);
          }}
        >
          <Text>Inline sheet</Text>
        </BottomSheetModal>
      </BottomSheetHostProvider>
    );
  };

  it('renders in the existing window with the shared spring instead of a native modal', () => {
    const view = render(<InlineHarness />);
    expect(view.UNSAFE_queryByType(Modal)).toBeNull();
    const sheet = view.UNSAFE_getByType(BottomSheet);
    expect(sheet.props.presentation).toBe('inline');
    expect(sheet.props.animation).toBe('spring');
    expect(view.getByText('Inline sheet')).toBeTruthy();
  });

  it('hides the underlying screen from accessibility until the overlay has closed', () => {
    const view = render(<InlineHarness />);
    expect(
      view.getByTestId('bottom-sheet-host-content', { includeHiddenElements: true }).props
        .importantForAccessibility,
    ).toBe('no-hide-descendants');
    expect(
      view.getByTestId('bottom-sheet-host-content', { includeHiddenElements: true }).props
        .pointerEvents,
    ).toBe('none');
    fireEvent.press(view.getByTestId('bottom-sheet-backdrop'));
    expect(
      view.getByTestId('bottom-sheet-host-content', { includeHiddenElements: true }).props
        .importantForAccessibility,
    ).toBe('no-hide-descendants');
    act(() => jest.advanceTimersByTime(300));
    expect(
      view.getByTestId('bottom-sheet-host-content', { includeHiddenElements: true }).props
        .importantForAccessibility,
    ).toBe('auto');
  });

  it('consumes hardware back while closing and removes its listener after unmount', () => {
    const handlers: (() => boolean | null | undefined)[] = [];
    const removed = jest.fn();
    const spy = jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_, handler) => {
      handlers.push(handler);
      return { remove: removed };
    });
    const onClose = jest.fn();
    const view = render(<InlineHarness onClose={onClose} />);
    expect(handlers).toHaveLength(1);
    act(() => {
      expect(handlers[0]()).toBe(true);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => {
      expect(handlers[0]()).toBe(true);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    act(() => jest.advanceTimersByTime(300));
    expect(removed).toHaveBeenCalledTimes(1);
    view.unmount();
    spy.mockRestore();
  });
});
