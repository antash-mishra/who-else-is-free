/**
 * Tests for SegmentedControl component
 * Covers selection state, onChange callback, accessibility
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react-native';

import SegmentedControl from '../SegmentedControl';

describe('SegmentedControl', () => {
  const mockOptions = [
    { label: 'Option A', value: 'a' },
    { label: 'Option B', value: 'b' },
    { label: 'Option C', value: 'c' },
  ];

  const defaultProps = {
    options: mockOptions,
    value: 'a',
    onChange: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Rendering', () => {
    it('should render all options', () => {
      render(<SegmentedControl {...defaultProps} />);

      expect(screen.getByText('Option A')).toBeTruthy();
      expect(screen.getByText('Option B')).toBeTruthy();
      expect(screen.getByText('Option C')).toBeTruthy();
    });

    it('should render option labels', () => {
      render(<SegmentedControl {...defaultProps} />);

      mockOptions.forEach((option) => {
        expect(screen.getByText(option.label)).toBeTruthy();
      });
    });

    it('should render all segment buttons with testIDs', () => {
      render(<SegmentedControl {...defaultProps} />);

      expect(screen.getByTestId('segment-a')).toBeTruthy();
      expect(screen.getByTestId('segment-b')).toBeTruthy();
      expect(screen.getByTestId('segment-c')).toBeTruthy();
    });

    it('should render with two options', () => {
      const twoOptions = [
        { label: 'Today', value: 'today' },
        { label: 'Tomorrow', value: 'tomorrow' },
      ];

      render(
        <SegmentedControl
          options={twoOptions}
          value="today"
          onChange={jest.fn()}
        />
      );

      expect(screen.getByText('Today')).toBeTruthy();
      expect(screen.getByText('Tomorrow')).toBeTruthy();
      expect(screen.getByTestId('segment-today')).toBeTruthy();
      expect(screen.getByTestId('segment-tomorrow')).toBeTruthy();
    });

    it('should render with many options', () => {
      const manyOptions = [
        { label: 'One', value: '1' },
        { label: 'Two', value: '2' },
        { label: 'Three', value: '3' },
        { label: 'Four', value: '4' },
        { label: 'Five', value: '5' },
      ];

      render(
        <SegmentedControl
          options={manyOptions}
          value="1"
          onChange={jest.fn()}
        />
      );

      manyOptions.forEach((option) => {
        expect(screen.getByText(option.label)).toBeTruthy();
      });
    });
  });

  describe('Selection State', () => {
    it('should identify the first option as active', () => {
      render(<SegmentedControl {...defaultProps} value="a" />);

      const activeSegment = screen.getByTestId('segment-a');
      expect(activeSegment.props.accessibilityState.selected).toBe(true);
    });

    it('should identify the second option as active', () => {
      render(<SegmentedControl {...defaultProps} value="b" />);

      const activeSegment = screen.getByTestId('segment-b');
      expect(activeSegment.props.accessibilityState.selected).toBe(true);
    });

    it('should identify the third option as active', () => {
      render(<SegmentedControl {...defaultProps} value="c" />);

      const activeSegment = screen.getByTestId('segment-c');
      expect(activeSegment.props.accessibilityState.selected).toBe(true);
    });

    it('should mark non-selected options as not selected', () => {
      render(<SegmentedControl {...defaultProps} value="a" />);

      const inactiveSegmentB = screen.getByTestId('segment-b');
      const inactiveSegmentC = screen.getByTestId('segment-c');

      expect(inactiveSegmentB.props.accessibilityState.selected).toBe(false);
      expect(inactiveSegmentC.props.accessibilityState.selected).toBe(false);
    });

    it('should update active state when value prop changes', () => {
      const { rerender } = render(<SegmentedControl {...defaultProps} value="a" />);

      expect(screen.getByTestId('segment-a').props.accessibilityState.selected).toBe(true);
      expect(screen.getByTestId('segment-b').props.accessibilityState.selected).toBe(false);

      rerender(<SegmentedControl {...defaultProps} value="b" />);

      expect(screen.getByTestId('segment-a').props.accessibilityState.selected).toBe(false);
      expect(screen.getByTestId('segment-b').props.accessibilityState.selected).toBe(true);
    });
  });

  describe('onChange Callback', () => {
    it('should call onChange with selected value when option is pressed', () => {
      const onChange = jest.fn();
      render(<SegmentedControl {...defaultProps} onChange={onChange} />);

      fireEvent.press(screen.getByTestId('segment-b'));

      expect(onChange).toHaveBeenCalledWith('b');
      expect(onChange).toHaveBeenCalledTimes(1);
    });

    it('should call onChange with the correct value for each option', () => {
      const onChange = jest.fn();
      render(<SegmentedControl {...defaultProps} onChange={onChange} />);

      fireEvent.press(screen.getByTestId('segment-a'));
      expect(onChange).toHaveBeenCalledWith('a');

      fireEvent.press(screen.getByTestId('segment-b'));
      expect(onChange).toHaveBeenCalledWith('b');

      fireEvent.press(screen.getByTestId('segment-c'));
      expect(onChange).toHaveBeenCalledWith('c');

      expect(onChange).toHaveBeenCalledTimes(3);
    });

    it('should call onChange even when pressing the already selected option', () => {
      const onChange = jest.fn();
      render(<SegmentedControl {...defaultProps} value="a" onChange={onChange} />);

      fireEvent.press(screen.getByTestId('segment-a'));

      expect(onChange).toHaveBeenCalledWith('a');
    });

    it('should allow switching between all options', () => {
      const onChange = jest.fn();
      const { rerender } = render(
        <SegmentedControl {...defaultProps} value="a" onChange={onChange} />
      );

      // Press b
      fireEvent.press(screen.getByTestId('segment-b'));
      expect(onChange).toHaveBeenLastCalledWith('b');

      // Simulate parent updating value
      rerender(<SegmentedControl {...defaultProps} value="b" onChange={onChange} />);

      // Press c
      fireEvent.press(screen.getByTestId('segment-c'));
      expect(onChange).toHaveBeenLastCalledWith('c');

      // Simulate parent updating value
      rerender(<SegmentedControl {...defaultProps} value="c" onChange={onChange} />);

      // Press a
      fireEvent.press(screen.getByTestId('segment-a'));
      expect(onChange).toHaveBeenLastCalledWith('a');
    });
  });

  describe('Accessibility', () => {
    it('should have tab accessibility role for all segments', () => {
      render(<SegmentedControl {...defaultProps} />);

      const segmentA = screen.getByTestId('segment-a');
      const segmentB = screen.getByTestId('segment-b');
      const segmentC = screen.getByTestId('segment-c');

      expect(segmentA.props.accessibilityRole).toBe('tab');
      expect(segmentB.props.accessibilityRole).toBe('tab');
      expect(segmentC.props.accessibilityRole).toBe('tab');
    });

    it('should have selected accessibility state for active option', () => {
      render(<SegmentedControl {...defaultProps} value="b" />);

      const activeSegment = screen.getByTestId('segment-b');
      expect(activeSegment.props.accessibilityState).toEqual({ selected: true });
    });

    it('should not have selected accessibility state for inactive options', () => {
      render(<SegmentedControl {...defaultProps} value="b" />);

      const inactiveSegmentA = screen.getByTestId('segment-a');
      const inactiveSegmentC = screen.getByTestId('segment-c');

      expect(inactiveSegmentA.props.accessibilityState).toEqual({ selected: false });
      expect(inactiveSegmentC.props.accessibilityState).toEqual({ selected: false });
    });
  });

  describe('Use Cases', () => {
    it('should work as date filter (Today/Tomorrow)', () => {
      const onChange = jest.fn();
      const dateOptions = [
        { label: 'Today', value: 'today' },
        { label: 'Tomorrow', value: 'tomorrow' },
      ];

      render(
        <SegmentedControl
          options={dateOptions}
          value="today"
          onChange={onChange}
        />
      );

      expect(screen.getByText('Today')).toBeTruthy();
      expect(screen.getByText('Tomorrow')).toBeTruthy();

      fireEvent.press(screen.getByTestId('segment-tomorrow'));
      expect(onChange).toHaveBeenCalledWith('tomorrow');
    });

    it('should work as event type filter', () => {
      const onChange = jest.fn();
      const typeOptions = [
        { label: 'All', value: 'all' },
        { label: 'Hosting', value: 'hosting' },
        { label: 'Joined', value: 'joined' },
        { label: 'Pending', value: 'pending' },
      ];

      render(
        <SegmentedControl
          options={typeOptions}
          value="all"
          onChange={onChange}
        />
      );

      fireEvent.press(screen.getByTestId('segment-hosting'));
      expect(onChange).toHaveBeenCalledWith('hosting');
    });

    it('should work as group type selector', () => {
      const onChange = jest.fn();
      const groupOptions = [
        { label: 'Single', value: 'single' },
        { label: 'Group', value: 'group' },
      ];

      render(
        <SegmentedControl
          options={groupOptions}
          value="single"
          onChange={onChange}
        />
      );

      expect(screen.getByTestId('segment-single').props.accessibilityState.selected).toBe(true);

      fireEvent.press(screen.getByTestId('segment-group'));
      expect(onChange).toHaveBeenCalledWith('group');
    });
  });

  describe('Key Extraction', () => {
    it('should use value as key (unique keys)', () => {
      // This tests that options with unique values render without key warnings
      const uniqueOptions = [
        { label: 'First', value: 'first' },
        { label: 'Second', value: 'second' },
        { label: 'Third', value: 'third' },
      ];

      render(
        <SegmentedControl
          options={uniqueOptions}
          value="first"
          onChange={jest.fn()}
        />
      );

      expect(screen.getByTestId('segment-first')).toBeTruthy();
      expect(screen.getByTestId('segment-second')).toBeTruthy();
      expect(screen.getByTestId('segment-third')).toBeTruthy();
    });
  });
});
