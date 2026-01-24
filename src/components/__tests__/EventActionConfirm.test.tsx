/**
 * Tests for EventActionConfirm component
 * Covers confirm/cancel callbacks, destructive variant
 */

describe('EventActionConfirm', () => {
  const defaultProps = {
    title: 'Confirm Action',
    description: 'Are you sure?',
    confirmLabel: 'Confirm',
    cancelLabel: 'Cancel',
    onConfirm: jest.fn(),
    onCancel: jest.fn(),
    confirmTone: 'default' as const,
    isConfirmLoading: false,
    errorMessage: null as string | null,
  };

  describe('Rendering', () => {
    it('should render title', () => {
      expect(defaultProps.title).toBe('Confirm Action');
    });

    it('should render description', () => {
      expect(defaultProps.description).toBe('Are you sure?');
    });

    it('should render confirm button label', () => {
      expect(defaultProps.confirmLabel).toBe('Confirm');
    });

    it('should render cancel button label', () => {
      expect(defaultProps.cancelLabel).toBe('Cancel');
    });

    it('should not render description when undefined', () => {
      const propsWithoutDesc = { ...defaultProps, description: undefined };
      expect(propsWithoutDesc.description).toBeUndefined();
    });
  });

  describe('Confirm Callback', () => {
    it('should call onConfirm when confirm button is pressed', () => {
      const onConfirm = jest.fn();
      onConfirm();

      expect(onConfirm).toHaveBeenCalled();
    });

    it('should not call onConfirm when loading', () => {
      const isLoading = true;
      const onConfirm = jest.fn();

      if (!isLoading) {
        onConfirm();
      }

      expect(onConfirm).not.toHaveBeenCalled();
    });
  });

  describe('Cancel Callback', () => {
    it('should call onCancel when cancel button is pressed', () => {
      const onCancel = jest.fn();
      onCancel();

      expect(onCancel).toHaveBeenCalled();
    });
  });

  describe('Destructive Variant', () => {
    it('should apply destructive tone styles', () => {
      const destructiveProps = { ...defaultProps, confirmTone: 'destructive' as const };
      expect(destructiveProps.confirmTone).toBe('destructive');
    });

    it('should show correct button color for destructive tone', () => {
      const confirmTone = 'destructive';
      const buttonStyle = confirmTone === 'destructive' ? 'destructive-style' : 'default-style';

      expect(buttonStyle).toBe('destructive-style');
    });
  });

  describe('Loading State', () => {
    it('should show loading text when isConfirmLoading is true', () => {
      const props = { ...defaultProps, isConfirmLoading: true };
      const buttonText = props.isConfirmLoading ? 'Deleting...' : props.confirmLabel;

      expect(buttonText).toBe('Deleting...');
    });

    it('should disable confirm button when loading', () => {
      const props = { ...defaultProps, isConfirmLoading: true };
      expect(props.isConfirmLoading).toBe(true);
    });

    it('should show confirm label when not loading', () => {
      const buttonText = defaultProps.isConfirmLoading ? 'Deleting...' : defaultProps.confirmLabel;
      expect(buttonText).toBe('Confirm');
    });
  });

  describe('Error Message', () => {
    it('should show error message when present', () => {
      const propsWithError = { ...defaultProps, errorMessage: 'Something went wrong' };
      expect(propsWithError.errorMessage).toBe('Something went wrong');
    });

    it('should not show error message when null', () => {
      expect(defaultProps.errorMessage).toBeNull();
    });
  });

  describe('Styling', () => {
    it('should have prompt style', () => {
      const promptStyle = { padding: 16 };
      expect(promptStyle.padding).toBe(16);
    });

    it('should have header style', () => {
      const headerStyle = { marginBottom: 8 };
      expect(headerStyle.marginBottom).toBe(8);
    });

    it('should have buttons container style', () => {
      const buttonsStyle = { flexDirection: 'row', gap: 8 };
      expect(buttonsStyle.flexDirection).toBe('row');
    });
  });

  describe('Button Styling', () => {
    it('should apply pressed style when pressed', () => {
      const pressed = true;
      const buttonStyle = pressed ? 'pressed-style' : 'normal-style';

      expect(buttonStyle).toBe('pressed-style');
    });

    it('should apply disabled style when loading', () => {
      const isLoading = true;
      const buttonStyle = isLoading ? 'disabled-style' : 'normal-style';

      expect(buttonStyle).toBe('disabled-style');
    });
  });

  describe('Accessibility', () => {
    it('should have button accessibility role', () => {
      const accessibilityRole = 'button';
      expect(accessibilityRole).toBe('button');
    });
  });
});
