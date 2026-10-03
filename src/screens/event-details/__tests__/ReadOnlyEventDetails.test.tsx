import { Text } from 'react-native';

import { render } from '@testing-library/react-native';

import ReadOnlyEventDetails from '../ReadOnlyEventDetails';

const props = {
  hero: <Text>Hero</Text>,
  info: <Text>Plan description</Text>,
  hostId: 1,
  currentUserId: 1,
  isLoading: false,
  error: null,
  contentContainerStyle: {},
};

describe('ReadOnlyEventDetails', () => {
  it('renders plan information and the host but initially leaves far-off members unmounted', () => {
    const members = Array.from({ length: 100 }, (_, index) => ({
      id: index + 1,
      name: `Member ${index + 1}`,
    }));
    const { getByText, queryByText, queryByLabelText } = render(
      <ReadOnlyEventDetails {...props} members={members} />,
    );
    expect(getByText('Hero')).toBeTruthy();
    expect(getByText('Plan description')).toBeTruthy();
    expect(getByText('Member 1 (you)')).toBeTruthy();
    expect(getByText('Host')).toBeTruthy();
    expect(queryByText('Member 100')).toBeNull();
    expect(queryByLabelText('More actions')).toBeNull();
  });

  it('preserves plan information while member loading fails or returns empty', () => {
    const { getByText, rerender } = render(
      <ReadOnlyEventDetails {...props} members={[]} error="Unable to load members right now." />,
    );
    expect(getByText('Plan description')).toBeTruthy();
    expect(getByText('Unable to load members right now.')).toBeTruthy();
    rerender(<ReadOnlyEventDetails {...props} members={[]} />);
    expect(getByText('No members')).toBeTruthy();
  });
});
