import { mockHaptics } from '../../__tests__/mocks/mockModules';
import {
  destructive,
  error,
  lightImpact,
  mediumImpact,
  selection,
  submit,
  success,
  triggerHaptic,
  warning,
} from '../haptics';

describe('haptics service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('maps selection feedback to selectionAsync', () => {
    selection();

    expect(mockHaptics.selectionAsync).toHaveBeenCalledTimes(1);
  });

  it('maps impact feedback semantically', () => {
    lightImpact();
    mediumImpact();
    submit();

    expect(mockHaptics.impactAsync).toHaveBeenCalledWith('Light');
    expect(mockHaptics.impactAsync).toHaveBeenCalledWith('Medium');
    expect(mockHaptics.impactAsync).toHaveBeenCalledTimes(3);
  });

  it('maps notification feedback semantically', () => {
    success();
    warning();
    destructive();
    error();

    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith('Success');
    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith('Warning');
    expect(mockHaptics.notificationAsync).toHaveBeenCalledWith('Error');
    expect(mockHaptics.notificationAsync).toHaveBeenCalledTimes(4);
  });

  it('does nothing for none feedback', () => {
    triggerHaptic('none');

    expect(mockHaptics.impactAsync).not.toHaveBeenCalled();
    expect(mockHaptics.notificationAsync).not.toHaveBeenCalled();
    expect(mockHaptics.selectionAsync).not.toHaveBeenCalled();
  });

  it('swallows unavailable haptics without throwing', () => {
    mockHaptics.impactAsync.mockImplementationOnce(() => {
      throw new Error('unavailable');
    });

    expect(() => triggerHaptic('light')).not.toThrow();
  });
});
