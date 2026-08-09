/**
 * Tests for SelectionModal component
 * Covers options list, selection, confirm/close behavior
 */

import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react-native';

import SelectionModal from '../SelectionModal';

describe('SelectionModal', () => {
  const mockOptions = ['Option A', 'Option B', 'Option C'];

  const defaultProps = {
    visible: true,
    title: 'Select Option',
    options: mockOptions as readonly string[],
    selectedValue: 'Option A',
    onSelect: jest.fn(),
    onConfirm: jest.fn(),
    onClose: jest.fn(),
    getLabel: (option: string) => option,
    getKey: (option: string) => option,
    isSelected: (option: string, selected: string) => option === selected,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Visibility', () => {
    it('should render when visible is true', () => {
      render(<SelectionModal {...defaultProps} visible={true} />);

      expect(screen.getByTestId('bottom-sheet-modal')).toBeTruthy();
    });

    it('should render modal with title when visible', () => {
      render(<SelectionModal {...defaultProps} visible={true} />);

      expect(screen.getByText('Select Option')).toBeTruthy();
    });
  });

  describe('Title', () => {
    it('should display title text', () => {
      render(<SelectionModal {...defaultProps} title="Choose Gender" />);

      expect(screen.getByText('Choose Gender')).toBeTruthy();
    });

    it('should display different title', () => {
      render(<SelectionModal {...defaultProps} title="Select Age Range" />);

      expect(screen.getByText('Select Age Range')).toBeTruthy();
    });
  });

  describe('Options List', () => {
    it('should render all options', () => {
      render(<SelectionModal {...defaultProps} />);

      expect(screen.getByText('Option A')).toBeTruthy();
      expect(screen.getByText('Option B')).toBeTruthy();
      expect(screen.getByText('Option C')).toBeTruthy();
    });

    it('should render options with testIDs', () => {
      render(<SelectionModal {...defaultProps} />);

      expect(screen.getByTestId('option-Option A')).toBeTruthy();
      expect(screen.getByTestId('option-Option B')).toBeTruthy();
      expect(screen.getByTestId('option-Option C')).toBeTruthy();
    });

    it('should render option labels using getLabel', () => {
      const customProps = {
        ...defaultProps,
        options: [
          { id: '1', name: 'First' },
          { id: '2', name: 'Second' },
        ] as readonly { id: string; name: string }[],
        selectedValue: { id: '1', name: 'First' },
        getLabel: (option: { id: string; name: string }) => option.name,
        getKey: (option: { id: string; name: string }) => option.id,
        isSelected: (option: { id: string; name: string }, selected: { id: string; name: string }) =>
          option.id === selected.id,
      };

      render(<SelectionModal {...customProps} />);

      expect(screen.getByText('First')).toBeTruthy();
      expect(screen.getByText('Second')).toBeTruthy();
    });

    it('should use getKey for option keys', () => {
      const customProps = {
        ...defaultProps,
        options: [
          { id: 'key-1', label: 'Label 1' },
          { id: 'key-2', label: 'Label 2' },
        ] as readonly { id: string; label: string }[],
        selectedValue: { id: 'key-1', label: 'Label 1' },
        getLabel: (option: { id: string; label: string }) => option.label,
        getKey: (option: { id: string; label: string }) => option.id,
        isSelected: (option: { id: string; label: string }, selected: { id: string; label: string }) =>
          option.id === selected.id,
      };

      render(<SelectionModal {...customProps} />);

      expect(screen.getByTestId('option-key-1')).toBeTruthy();
      expect(screen.getByTestId('option-key-2')).toBeTruthy();
    });
  });

  describe('Selection', () => {
    it('should call onSelect when option is pressed', () => {
      const onSelect = jest.fn();
      render(<SelectionModal {...defaultProps} onSelect={onSelect} />);

      fireEvent.press(screen.getByTestId('option-Option B'));

      expect(onSelect).toHaveBeenCalledWith('Option B');
      expect(onSelect).toHaveBeenCalledTimes(1);
    });

    it('should call onSelect with correct option for each press', () => {
      const onSelect = jest.fn();
      render(<SelectionModal {...defaultProps} onSelect={onSelect} />);

      fireEvent.press(screen.getByTestId('option-Option A'));
      expect(onSelect).toHaveBeenCalledWith('Option A');

      fireEvent.press(screen.getByTestId('option-Option B'));
      expect(onSelect).toHaveBeenCalledWith('Option B');

      fireEvent.press(screen.getByTestId('option-Option C'));
      expect(onSelect).toHaveBeenCalledWith('Option C');

      expect(onSelect).toHaveBeenCalledTimes(3);
    });

    it('should allow selecting already selected option', () => {
      const onSelect = jest.fn();
      render(
        <SelectionModal {...defaultProps} selectedValue="Option A" onSelect={onSelect} />
      );

      fireEvent.press(screen.getByTestId('option-Option A'));

      expect(onSelect).toHaveBeenCalledWith('Option A');
    });

    it('should update selection when selectedValue prop changes', () => {
      const { rerender } = render(
        <SelectionModal {...defaultProps} selectedValue="Option A" />
      );

      // Rerender with new selection
      rerender(<SelectionModal {...defaultProps} selectedValue="Option B" />);

      // Component should still render properly
      expect(screen.getByText('Option B')).toBeTruthy();
    });
  });

  describe('Confirm Behavior', () => {
    it('should call onConfirm when Done button is pressed', () => {
      const onConfirm = jest.fn();
      render(<SelectionModal {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.press(screen.getByText('Done'));

      // Run animation timers
      act(() => {
        jest.runAllTimers();
      });

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });

    it('should show Done button text', () => {
      render(<SelectionModal {...defaultProps} />);

      expect(screen.getByText('Done')).toBeTruthy();
    });
  });

  describe('Close Behavior', () => {
    it('should call onClose when X button is pressed', () => {
      const onClose = jest.fn();
      render(<SelectionModal {...defaultProps} onClose={onClose} />);

      fireEvent.press(screen.getByTestId('bottom-sheet-close'));

      // Run animation timers
      act(() => {
        jest.runAllTimers();
      });

      expect(onClose).toHaveBeenCalled();
    });

    it('should call onClose when backdrop is pressed', () => {
      const onClose = jest.fn();
      render(<SelectionModal {...defaultProps} onClose={onClose} />);

      fireEvent.press(screen.getByTestId('bottom-sheet-backdrop'));

      // Run animation timers
      act(() => {
        jest.runAllTimers();
      });

      expect(onClose).toHaveBeenCalled();
    });
  });

  describe('With Complex Options', () => {
    it('should work with object options', () => {
      const genderOptions = [
        { value: 'any', label: 'All Gender' },
        { value: 'male', label: 'Male' },
        { value: 'female', label: 'Female' },
      ] as const;

      type GenderOption = (typeof genderOptions)[number];

      const onSelect = jest.fn();

      render(
        <SelectionModal
          visible={true}
          title="Select Gender"
          options={genderOptions}
          selectedValue={genderOptions[0]}
          onSelect={onSelect}
          onConfirm={jest.fn()}
          onClose={jest.fn()}
          getLabel={(option: GenderOption) => option.label}
          getKey={(option: GenderOption) => option.value}
          isSelected={(option: GenderOption, selected: GenderOption) =>
            option.value === selected.value
          }
        />
      );

      expect(screen.getByText('All Gender')).toBeTruthy();
      expect(screen.getByText('Male')).toBeTruthy();
      expect(screen.getByText('Female')).toBeTruthy();

      fireEvent.press(screen.getByTestId('option-female'));
      expect(onSelect).toHaveBeenCalledWith(genderOptions[2]);
    });

    it('should work with numeric options', () => {
      const ageOptions = [18, 21, 25, 30, 35];
      const onSelect = jest.fn();

      render(
        <SelectionModal
          visible={true}
          title="Select Minimum Age"
          options={ageOptions}
          selectedValue={18}
          onSelect={onSelect}
          onConfirm={jest.fn()}
          onClose={jest.fn()}
          getLabel={(option: number) => `${option} years`}
          getKey={(option: number) => String(option)}
          isSelected={(option: number, selected: number) => option === selected}
        />
      );

      expect(screen.getByText('18 years')).toBeTruthy();
      expect(screen.getByText('21 years')).toBeTruthy();
      expect(screen.getByText('25 years')).toBeTruthy();

      fireEvent.press(screen.getByTestId('option-25'));
      expect(onSelect).toHaveBeenCalledWith(25);
    });
  });

  describe('Use Cases', () => {
    it('should work as gender selector', () => {
      const genderOptions = ['Any', 'Male', 'Female'];
      const onSelect = jest.fn();
      const onConfirm = jest.fn();

      render(
        <SelectionModal
          visible={true}
          title="Select Gender"
          options={genderOptions}
          selectedValue="Any"
          onSelect={onSelect}
          onConfirm={onConfirm}
          onClose={jest.fn()}
          getLabel={(option: string) => option}
          getKey={(option: string) => option}
          isSelected={(option: string, selected: string) => option === selected}
        />
      );

      expect(screen.getByText('Select Gender')).toBeTruthy();
      expect(screen.getByText('Any')).toBeTruthy();
      expect(screen.getByText('Male')).toBeTruthy();
      expect(screen.getByText('Female')).toBeTruthy();

      fireEvent.press(screen.getByTestId('option-Female'));
      expect(onSelect).toHaveBeenCalledWith('Female');
    });

    it('should work as group type selector', () => {
      const groupOptions = ['Single', 'Group'];
      const onSelect = jest.fn();

      render(
        <SelectionModal
          visible={true}
          title="Group Type"
          options={groupOptions}
          selectedValue="Single"
          onSelect={onSelect}
          onConfirm={jest.fn()}
          onClose={jest.fn()}
          getLabel={(option: string) => option}
          getKey={(option: string) => option}
          isSelected={(option: string, selected: string) => option === selected}
        />
      );

      expect(screen.getByText('Group Type')).toBeTruthy();
      expect(screen.getByText('Single')).toBeTruthy();
      expect(screen.getByText('Group')).toBeTruthy();

      fireEvent.press(screen.getByTestId('option-Group'));
      expect(onSelect).toHaveBeenCalledWith('Group');
    });

    it('should work as time selector', () => {
      const timeOptions = ['Morning', 'Afternoon', 'Evening', 'Night'];
      const onSelect = jest.fn();

      render(
        <SelectionModal
          visible={true}
          title="Select Time"
          options={timeOptions}
          selectedValue="Morning"
          onSelect={onSelect}
          onConfirm={jest.fn()}
          onClose={jest.fn()}
          getLabel={(option: string) => option}
          getKey={(option: string) => option}
          isSelected={(option: string, selected: string) => option === selected}
        />
      );

      expect(screen.getByText('Morning')).toBeTruthy();
      expect(screen.getByText('Afternoon')).toBeTruthy();
      expect(screen.getByText('Evening')).toBeTruthy();
      expect(screen.getByText('Night')).toBeTruthy();
    });
  });

  describe('Animation', () => {
    it('should animate on confirm', () => {
      const onConfirm = jest.fn();
      render(<SelectionModal {...defaultProps} onConfirm={onConfirm} />);

      fireEvent.press(screen.getByText('Done'));

      expect(onConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
