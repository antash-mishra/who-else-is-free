import { readFileSync } from 'fs';
import { join } from 'path';

import { Linking, StyleSheet } from 'react-native';

import { fireEvent, render } from '@testing-library/react-native';

import PrivacyPolicyScreen from '@screens/PrivacyPolicyScreen';
import { colors, typography } from '@theme/index';

import { mockNavigation } from '../../__tests__/mocks/mockModules';
import privacyPolicyMarkdown from '../../content/privacyPolicyMarkdown';

describe('PrivacyPolicyScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders the privacy policy content from the markdown source', () => {
    const { getAllByText, getByLabelText, getByText } = render(<PrivacyPolicyScreen />);

    expect(getByText('Privacy policy')).toBeTruthy();
    // Displayed in capitals ("WEIF PRIVACY POLICY") by the title style.
    expect(StyleSheet.flatten(getByText('weif privacy policy').props.style).textTransform).toBe(
      'uppercase',
    );
    expect(getByText('Last updated October 14, 2026')).toBeTruthy();
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

  it('shows the contact email in regular weight and blue, not underlined', () => {
    const { getAllByText } = render(<PrivacyPolicyScreen />);
    const style = StyleSheet.flatten(getAllByText('contact@weifapp.com')[0].props.style);

    expect(style.color).toBe(colors.secondary);
    expect(style.fontFamily).not.toBe(typography.fontFamilySemiBold);
    expect(style.textDecorationLine).toBeUndefined();
  });

  it('opens the mail app when the contact email is tapped', () => {
    const openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
    const { getAllByText } = render(<PrivacyPolicyScreen />);
    const email = getAllByText('contact@weifapp.com')[0];

    expect(email.props.accessibilityRole).toBe('link');
    fireEvent.press(email);

    expect(openURL).toHaveBeenCalledWith('mailto:contact@weifapp.com');
    openURL.mockRestore();
  });

  it('keeps named documents bold', () => {
    const { getByText } = render(<PrivacyPolicyScreen />);
    const style = StyleSheet.flatten(getByText('Google API Services User Data Policy').props.style);

    expect(style.fontFamily).toBe(typography.fontFamilySemiBold);
  });

  it('points data requests at things that exist', () => {
    expect(privacyPolicyMarkdown).not.toContain('data subject access request');
    expect(privacyPolicyMarkdown).not.toContain('Learn more about withdrawing your consent');
    expect(privacyPolicyMarkdown).toContain('Profile → Delete account');
    expect(privacyPolicyMarkdown).not.toContain('Log in to your account profile and update');
    expect(privacyPolicyMarkdown).not.toContain(
      'troubleshoot problems, assist with any investigations',
    );
  });

  it('states that safety reports outlive a deleted account', () => {
    expect(privacyPolicyMarkdown).toContain(
      'for up to 12 months, even after you delete your account',
    );
    expect(privacyPolicyMarkdown).not.toContain(
      'No purpose in this notice will require us keeping',
    );
    // The deletion paragraph must not claim reports go with the account.
    expect(privacyPolicyMarkdown).not.toContain('join requests, reports, blocks');
    expect(privacyPolicyMarkdown).toContain(
      'Reports, including any chat messages copied into them, are kept as described above.',
    );
  });

  it('keeps the repository copy of the policy identical to the in-app text', () => {
    const repositoryCopy = readFileSync(
      join(__dirname, '../../../Privacy Policy 3702ef2fbf48809782a1c5b89f71b3f3.md'),
      'utf8',
    );

    expect(repositoryCopy.trimEnd()).toBe(privacyPolicyMarkdown.trimEnd());
  });
});
