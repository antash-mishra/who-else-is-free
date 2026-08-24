import { fireEvent, render } from '@testing-library/react-native';

import PrivacyPolicyScreen from '@screens/PrivacyPolicyScreen';

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
    expect(getByText('Last updated June 15, 2026')).toBeTruthy();
    expect(getByText('TABLE OF CONTENTS')).toBeTruthy();
    expect(getByLabelText('Jump to WHAT INFORMATION DO WE COLLECT?')).toBeTruthy();
    expect(getByText('Google API Services User Data Policy')).toBeTruthy();
    expect(getAllByText('xyz@weif.com').length).toBeGreaterThanOrEqual(1);

    fireEvent.press(getByLabelText('Jump to WHAT INFORMATION DO WE COLLECT?'));

    fireEvent.press(getByLabelText('Go back'));
    expect(mockNavigation.goBack).toHaveBeenCalledTimes(1);
  });

  it('does not retain obsolete Notion links in the policy source', () => {
    expect(privacyPolicyMarkdown).not.toContain('app.notion.com');
    expect(privacyPolicyMarkdown).not.toContain('[Old');
  });
});
