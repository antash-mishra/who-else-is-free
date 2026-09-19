import React from 'react';

import { render, screen } from '@testing-library/react-native';

import EventMemberRow from '../EventMemberRow';

const host = { id: 1, name: 'Sumit' };
const other = { id: 2, name: 'Sumit Narang' };

describe('EventMemberRow', () => {
  it('suffixes the viewer\'s own row with "(you)"', () => {
    render(<EventMemberRow member={host} currentUserId={host.id} />);

    expect(screen.getByText('Sumit (you)')).toBeTruthy();
    expect(screen.queryByText('Sumit')).toBeNull();
  });

  it('leaves other members unsuffixed', () => {
    render(<EventMemberRow member={other} currentUserId={host.id} />);

    expect(screen.getByText('Sumit Narang')).toBeTruthy();
  });

  it('renders the plain name when the viewer is unknown', () => {
    render(<EventMemberRow member={host} />);

    expect(screen.getByText('Sumit')).toBeTruthy();
  });

  // Two members can share a display name, which is the case the suffix exists
  // for: without it the rows are indistinguishable.
  it('distinguishes the viewer from a member with a similar name', () => {
    render(
      <>
        <EventMemberRow member={host} currentUserId={host.id} trailingLabel="Host" />
        <EventMemberRow member={other} currentUserId={host.id} onMenuPress={jest.fn()} />
      </>,
    );

    expect(screen.getByText('Sumit (you)')).toBeTruthy();
    expect(screen.getByText('Sumit Narang')).toBeTruthy();
    expect(screen.getByText('Host')).toBeTruthy();
  });

  it('announces the menu against the suffixed name', () => {
    render(<EventMemberRow member={host} currentUserId={host.id} onMenuPress={jest.fn()} />);

    expect(screen.getByLabelText('Open actions for Sumit (you)')).toBeTruthy();
  });
});
