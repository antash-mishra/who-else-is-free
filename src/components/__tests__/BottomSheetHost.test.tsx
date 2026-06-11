import React, { useState } from 'react';

import { Pressable, Text, View } from 'react-native';

import { fireEvent, render, waitFor } from '@testing-library/react-native';

import BottomSheetModal from '../BottomSheetModal';
import { BottomSheetHostProvider } from '../sheets';

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
