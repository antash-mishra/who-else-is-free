import { StyleSheet } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';

import PrivacyPolicyScreen from '@screens/PrivacyPolicyScreen';
import { typography } from '@theme/index';

import { mockNavigation } from '../../__tests__/mocks/mockModules';
import privacyPolicyMarkdown from '../../content/privacyPolicyMarkdown';

describe('PrivacyPolicyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the privacy policy content from the markdown source', () => {
    const { getAllByText, getByLabelText, getByText } = render(<PrivacyPolicyScreen />);

    expect(getByText('Privacy policy')).toBeTruthy();
    expect(getByText('WEIF PRIVACY POLICY')).toBeTruthy();
    expect(getByText('Last updated October 8, 2026')).toBeTruthy();
    expect(getByText('TABLE OF CONTENTS')).toBeTruthy();
    expect(getByLabelText('Jump to WHAT INFORMATION DO WE COLLECT?')).toBeTruthy();
    expect(getByText('Google API Services User Data Policy')).toBeTruthy();
    expect(getAllByText('contact@weifapp.com').length).toBeGreaterThanOrEqual(1);

    fireEvent.press(getByLabelText('Jump to WHAT INFORMATION DO WE COLLECT?'));

    fireEvent.press(getByLabelText('Go back'));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('does not retain obsolete Notion links in the policy source', () => {
    expect(privacyPolicyMarkdown).not.toContain('app.notion.com');
    expect(privacyPolicyMarkdown).not.toContain('[Old');
  });

  it('uses the real support address and one name for the document', () => {
    expect(privacyPolicyMarkdown).not.toContain('xyz@weif.com');
    expect(privacyPolicyMarkdown.match(/contact@weifapp\.com/g)).toHaveLength(5);
    expect(privacyPolicyMarkdown).not.toContain('Privacy Notice');
  });

  it('shows contact details as plain bold text, not as links that cannot be tapped', () => {
    const { getAllByText } = render(<PrivacyPolicyScreen />);
    const email = getAllByText('contact@weifapp.com')[0];
    const style = StyleSheet.flatten(email.props.style);

    expect(style.textDecorationLine).toBeUndefined();
    expect(style.fontFamily).toBe(typography.fontFamilySemiBold);
  });

  it('points data requests at things that exist', () => {
    expect(privacyPolicyMarkdown).not.toContain('data subject access request');
    expect(privacyPolicyMarkdown).not.toContain('Learn more about withdrawing your consent');
    expect(privacyPolicyMarkdown).toContain('Profile → Delete account');
  });
});
