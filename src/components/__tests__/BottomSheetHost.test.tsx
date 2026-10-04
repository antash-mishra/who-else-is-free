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

describe('prepared inline sheets', () => {
  const mounted = jest.fn();
  const unmounted = jest.fn();
  const RetainedContent = () => {
    React.useEffect(() => {
      mounted();
      return () => {
        unmounted();
      };
    }, []);
    return <Text>Prepared picker</Text>;
  };
  const PreparedHarness = ({
    includePicker = true,
    forceOther = false,
  }: {
    includePicker?: boolean;
    forceOther?: boolean;
  }) => {
    const [visible, setVisible] = useState(false);
    const [otherVisible, setOtherVisible] = useState(false);
    return (
      <BottomSheetHostProvider>
        <Pressable testID="open-picker" onPress={() => setVisible(true)} />
        <Pressable testID="open-other" onPress={() => setOtherVisible(true)} />
        {includePicker ? (
          <BottomSheetModal
            visible={visible}
            presentation="inline"
            keepMounted
            onClose={() => setVisible(false)}
          >
            <RetainedContent />
          </BottomSheetModal>
        ) : null}
        <BottomSheetModal
          visible={otherVisible || forceOther}
          onClose={() => setOtherVisible(false)}
        >
          <Text>Other modal</Text>
        </BottomSheetModal>
      </BottomSheetHostProvider>
    );
  };

  beforeEach(() => {
    mounted.mockClear();
    unmounted.mockClear();
  });

  it('prepares hidden content without blocking the screen or registering Back', () => {
    const back = jest.spyOn(BackHandler, 'addEventListener');
    const view = render(<PreparedHarness />);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(view.queryByText('Prepared picker')).toBeNull();
    expect(view.getByText('Prepared picker', { includeHiddenElements: true })).toBeTruthy();
    expect(view.getByTestId('bottom-sheet-host-content').props.pointerEvents).toBe('auto');
    expect(view.UNSAFE_queryByType(Modal)).toBeNull();
    expect(back).not.toHaveBeenCalled();
    back.mockRestore();
  });

  it('reuses the native subtree across opening, closing, and another modal', () => {
    const view = render(<PreparedHarness />);
    const content = view.getByText('Prepared picker', { includeHiddenElements: true });
    fireEvent.press(view.getByTestId('open-picker'));
    expect(view.getByText('Prepared picker')).toBe(content);
    fireEvent.press(view.getByTestId('bottom-sheet-backdrop'));
    act(() => jest.advanceTimersByTime(300));
    expect(view.queryByText('Prepared picker')).toBeNull();
    fireEvent.press(view.getByTestId('open-other'));
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
    fireEvent.press(view.getByTestId('bottom-sheet-backdrop'));
    act(() => jest.advanceTimersByTime(350));
    fireEvent.press(view.getByTestId('open-picker'));
    expect(view.getByText('Prepared picker')).toBe(content);
    expect(mounted).toHaveBeenCalledTimes(1);
    expect(unmounted).not.toHaveBeenCalled();
  });

  it('releases the prepared subtree when its adapter leaves, including while open', () => {
    const view = render(<PreparedHarness />);
    fireEvent.press(view.getByTestId('open-picker'));
    view.rerender(<PreparedHarness includePicker={false} />);
    expect(view.queryByText('Prepared picker', { includeHiddenElements: true })).toBeNull();
    expect(unmounted).toHaveBeenCalledTimes(1);
    expect(view.getByTestId('bottom-sheet-host-content').props.pointerEvents).toBe('auto');
    act(() => jest.advanceTimersByTime(400));
    expect(view.UNSAFE_queryByType(BottomSheet)).toBeNull();
  });

  it('a retained sheet finishing its close cannot dismiss a newer modal', () => {
    const view = render(<PreparedHarness />);
    fireEvent.press(view.getByTestId('open-picker'));
    fireEvent.press(view.getByTestId('bottom-sheet-backdrop'));
    view.rerender(<PreparedHarness forceOther />);
    act(() => jest.advanceTimersByTime(350));
    expect(view.getByText('Other modal')).toBeTruthy();
    expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
  });
});

it('releases a prepared owner when it switches to native modal presentation', () => {
  const Harness = ({ inline }: { inline: boolean }) => (
    <BottomSheetHostProvider>
      <BottomSheetModal
        visible
        presentation={inline ? 'inline' : 'modal'}
        keepMounted
        onClose={jest.fn()}
      >
        <Text>{inline ? 'Prepared content' : 'Modal content'}</Text>
      </BottomSheetModal>
    </BottomSheetHostProvider>
  );
  const view = render(<Harness inline />);
  expect(view.UNSAFE_queryByType(Modal)).toBeNull();
  view.rerender(<Harness inline={false} />);
  expect(view.getByText('Modal content')).toBeTruthy();
  expect(view.queryByText('Prepared content', { includeHiddenElements: true })).toBeNull();
  expect(view.UNSAFE_getAllByType(BottomSheet)).toHaveLength(1);
  expect(view.UNSAFE_getAllByType(Modal)).toHaveLength(1);
});
