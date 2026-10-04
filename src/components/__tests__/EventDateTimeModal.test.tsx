import React from 'react';

import { FlatList, ScrollView, Text } from 'react-native';

import { act, fireEvent, render, within } from '@testing-library/react-native';

import { EventDateTimePickerContent } from '../EventDateTimeModal';

describe('EventDateTimePickerContent', () => {
  const minDate = new Date(2026, 9, 4, 12);
  const maxDate = new Date(2026, 10, 3, 12);
  const value = new Date(2026, 9, 4, 19, 30);

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date(minDate.getTime() - 60_000));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('renders all four selected wheels in the first render without waiting for interactions', () => {
    const view = render(
      <EventDateTimePickerContent
        visible
        value={value}
        minDate={minDate}
        maxDate={maxDate}
        onConfirm={jest.fn()}
      />,
    );

    const wheels = view.UNSAFE_getAllByType(ScrollView);
    expect(wheels).toHaveLength(4);
    expect(wheels.map((wheel) => wheel.props.contentOffset.y)).toEqual([
      0,
      (12 + 6) * 44,
      (60 + 30) * 44,
      44,
    ]);
    expect(view.getByText('Today')).toBeTruthy();
  });

  const renderPicker = (initial = value, visible = true) => {
    const onConfirm = jest.fn();
    const props = { visible, value: initial, minDate, maxDate, onConfirm };
    const view = render(<EventDateTimePickerContent {...props} />);
    const wheels = () => view.UNSAFE_getAllByType(ScrollView);
    const confirm = () => fireEvent.press(view.getByText('Done'));
    return { view, wheels, confirm, onConfirm, props };
  };

  it('mounts bounded date, hour, and minute windows around the initial selection', () => {
    const picker = renderPicker(new Date(2026, 9, 5, 19, 59));
    expect(within(picker.wheels()[0]).UNSAFE_getAllByType(Text).length).toBeLessThan(30);
    expect(within(picker.wheels()[1]).UNSAFE_getAllByType(Text).length).toBeLessThan(30);
    const minute = picker.wheels()[2];
    expect(within(minute).getByText('59')).toBeTruthy();
    expect(within(minute).UNSAFE_getAllByType(Text).length).toBeLessThan(30);
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(new Date(2026, 9, 5, 19, 59));
  });

  it('mounts the neighboring rows above the selection immediately', () => {
    const picker = renderPicker(new Date(2026, 9, 5, 19, 59));
    expect(within(picker.wheels()[0]).getByText('Today')).toBeTruthy();
    expect(within(picker.wheels()[1]).getByText('5')).toBeTruthy();
    expect(within(picker.wheels()[1]).getByText('6')).toBeTruthy();
    expect(within(picker.wheels()[2]).getByText('57')).toBeTruthy();
    expect(within(picker.wheels()[2]).getByText('58')).toBeTruthy();
  });

  it('confirms the supplied selection without requiring an opening callback', () => {
    const picker = renderPicker();
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(value);
  });

  it.each([
    [new Date(2026, 9, 3, 9), minDate],
    [new Date(2026, 10, 4, 9), maxDate],
  ])('clamps an external selection to the date bounds', (initial, expected) => {
    const picker = renderPicker(initial);
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(expected);
  });

  it('selects a date while preserving the hour and minute', () => {
    const picker = renderPicker();
    fireEvent.press(picker.view.getByText('Tomorrow'));
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(new Date(2026, 9, 5, 19, 30));
  });

  it.each([
    ['AM', 0],
    ['PM', 12],
  ])('interprets 12 %s correctly', (period, hour) => {
    const picker = renderPicker(new Date(2026, 9, 5, 19, 30));
    fireEvent(picker.wheels()[1], 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { y: 23 * 44 } },
    });
    fireEvent.press(within(picker.wheels()[3]).getByText(period));
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(new Date(2026, 9, 5, hour, 30));
  });

  it('rejects a past time and clears the error after correcting the selection', () => {
    const picker = renderPicker();
    fireEvent.press(within(picker.wheels()[3]).getByText('AM'));
    picker.confirm();
    expect(picker.onConfirm).not.toHaveBeenCalled();
    expect(picker.view.getByText('Please choose a future time')).toBeTruthy();
    fireEvent.press(within(picker.wheels()[3]).getByText('PM'));
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(value);
    expect(picker.view.queryByText('Please choose a future time')).toBeNull();
  });

  it('settles a slow drag without momentum at the nearest minute', () => {
    const picker = renderPicker();
    const minute = picker.wheels()[2];
    fireEvent(minute, 'scrollBeginDrag');
    fireEvent.scroll(minute, {
      nativeEvent: {
        contentOffset: { x: 0, y: 91 * 44 + 9 },
        layoutMeasurement: { width: 44, height: 220 },
        contentSize: { width: 44, height: 180 * 44 + 176 },
      },
    });
    fireEvent(minute, 'scrollEndDrag', {
      nativeEvent: {
        contentOffset: { x: 0, y: 91 * 44 + 9 },
        layoutMeasurement: { width: 44, height: 220 },
        contentSize: { width: 44, height: 180 * 44 + 176 },
      },
    });
    act(() => jest.advanceTimersByTime(16));
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(new Date(2026, 9, 4, 19, 31));
  });

  it('waits for momentum to finish and wraps the minute column', () => {
    const picker = renderPicker();
    const minute = picker.wheels()[2];
    fireEvent(minute, 'scrollBeginDrag');
    fireEvent(minute, 'scrollEndDrag', { nativeEvent: { contentOffset: { y: 119 * 44 } } });
    fireEvent(minute, 'momentumScrollBegin');
    act(() => jest.advanceTimersByTime(16));
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenLastCalledWith(value);
    fireEvent.scroll(minute, {
      nativeEvent: {
        contentOffset: { x: 0, y: 120 * 44 },
        layoutMeasurement: { width: 44, height: 220 },
        contentSize: { width: 44, height: 180 * 44 + 176 },
      },
    });
    fireEvent(minute, 'momentumScrollEnd', {
      nativeEvent: {
        contentOffset: { x: 0, y: 120 * 44 },
        layoutMeasurement: { width: 44, height: 220 },
        contentSize: { width: 44, height: 180 * 44 + 176 },
      },
    });
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenLastCalledWith(new Date(2026, 9, 4, 19, 0));
  });

  it('wraps the hour column without changing AM/PM or the date', () => {
    const picker = renderPicker();
    fireEvent(picker.wheels()[1], 'momentumScrollEnd', {
      nativeEvent: { contentOffset: { y: 24 * 44 } },
    });
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(new Date(2026, 9, 4, 13, 30));
  });

  it('resets an unconfirmed draft immediately when reopened with a changed value', () => {
    const picker = renderPicker();
    fireEvent.press(within(picker.wheels()[2]).getAllByText('31')[0]);
    picker.view.rerender(<EventDateTimePickerContent {...picker.props} visible={false} />);
    const next = new Date(2026, 9, 6, 14, 59);
    picker.view.rerender(<EventDateTimePickerContent {...picker.props} value={next} />);
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(next);
    expect(picker.wheels().map((wheel) => wheel.props.contentOffset.y)).toEqual([
      2 * 44,
      (12 + 1) * 44,
      (60 + 59) * 44,
      44,
    ]);
  });

  it('cancels a pending drag settle on close so it cannot change a reopened draft', () => {
    const picker = renderPicker();
    fireEvent(picker.wheels()[2], 'scrollEndDrag', {
      nativeEvent: { contentOffset: { y: 91 * 44 } },
    });
    picker.view.rerender(<EventDateTimePickerContent {...picker.props} visible={false} />);
    const next = new Date(2026, 9, 5, 14, 59);
    picker.view.rerender(<EventDateTimePickerContent {...picker.props} value={next} />);
    act(() => jest.advanceTimersByTime(16));
    picker.confirm();
    expect(picker.onConfirm).toHaveBeenCalledWith(next);
  });

  it('clears a pending drag settle when unmounted', () => {
    const picker = renderPicker();
    const before = jest.getTimerCount();
    fireEvent(picker.wheels()[2], 'scrollEndDrag', {
      nativeEvent: { contentOffset: { y: 91 * 44 } },
    });
    expect(jest.getTimerCount()).toBeGreaterThan(before);
    picker.view.unmount();
    expect(jest.getTimerCount()).toBe(before);
  });
});

it('resets a retained draft while hidden and ignores late native momentum', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 4, 12));
  const value = new Date(2026, 9, 5, 19, 30);
  const props = {
    value,
    minDate: new Date(2026, 9, 4, 12),
    maxDate: new Date(2026, 10, 3, 12),
    onConfirm: jest.fn(),
    prepareWhileHidden: true,
  };
  const view = render(<EventDateTimePickerContent {...props} visible />);
  const wheels = () => view.UNSAFE_getAllByType(ScrollView);
  fireEvent(wheels()[2], 'momentumScrollEnd', { nativeEvent: { contentOffset: { y: 91 * 44 } } });
  view.rerender(<EventDateTimePickerContent {...props} visible={false} />);
  fireEvent(wheels()[2], 'momentumScrollEnd', { nativeEvent: { contentOffset: { y: 95 * 44 } } });
  expect(wheels()[2].props.contentOffset.y).toBe(90 * 44);
  view.rerender(<EventDateTimePickerContent {...props} visible />);
  fireEvent.press(view.getByText('Done'));
  expect(props.onConfirm).toHaveBeenCalledWith(value);
  view.unmount();
  jest.useRealTimers();
});

it('keeps prepared list props stable when visibility and time-of-day bounds change', () => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date(2026, 9, 4, 12));
  const props = {
    value: new Date(2026, 9, 5, 19, 59),
    minDate: new Date(2026, 9, 4, 12),
    maxDate: new Date(2026, 10, 3, 12),
    onConfirm: jest.fn(),
  };
  const view = render(<EventDateTimePickerContent {...props} visible={false} />);
  const original = view.UNSAFE_getAllByType(FlatList).map((wheel) => wheel.props);
  view.rerender(
    <EventDateTimePickerContent
      {...props}
      visible
      minDate={new Date(2026, 9, 4, 12, 1)}
      maxDate={new Date(2026, 10, 3, 12, 1)}
    />,
  );
  const opened = view.UNSAFE_getAllByType(FlatList).map((wheel) => wheel.props);
  opened.forEach((props, index) => {
    expect(props.data).toBe(original[index].data);
    expect(props.renderItem).toBe(original[index].renderItem);
    expect(props.onMomentumScrollEnd).toBe(original[index].onMomentumScrollEnd);
  });
  fireEvent.press(view.getByText('Done'));
  expect(props.onConfirm).toHaveBeenCalledWith(props.value);
  view.unmount();
  jest.useRealTimers();
});
