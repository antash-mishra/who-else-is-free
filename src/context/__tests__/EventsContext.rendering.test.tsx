/**
 * EventsContext rendering tests
 * Tests the EventsContext provider with actual component rendering using @testing-library/react-native
 */

import React from 'react';
import { Text, Button } from 'react-native';
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react-native';
import fetchMock from 'jest-fetch-mock';

import { EventsProvider, useEvents, UserEvent } from '../EventsContext';
import { mockUsers, mockApiResponses, createTodayEvent } from '../../__tests__/mocks/mockData';

// Mock AuthContext
const mockAuthUser = mockUsers[0];
const mockToken = 'mock-jwt-token';
const mockRefreshSessionSilently = jest.fn().mockResolvedValue(null);
const mockAuthFetch = jest.fn((...args: Parameters<typeof fetch>) => fetch(...args));

jest.mock('../AuthContext', () => ({
  useAuth: jest.fn(() => ({
    user: mockAuthUser,
    token: mockToken,
    refreshSessionSilently: mockRefreshSessionSilently,
    authFetch: mockAuthFetch,
  })),
}));

// Mock covers module
jest.mock('@constants/covers', () => ({
  resolveCoverUri: jest.fn((key?: string) => key ? `mock-uri-${key}` : 'default-uri'),
  DEFAULT_COVER_KEY: 'badminton',
}));

// Mock API config
jest.mock('@api/config', () => ({
  API_BASE_URL: 'http://localhost:8080',
}));

// Helper type for context value
type EventsContextValue = ReturnType<typeof useEvents>;

// Test consumer component to access context
const TestConsumer = ({
  onMount,
  testID = 'consumer',
}: {
  onMount?: (ctx: EventsContextValue) => void;
  testID?: string;
}) => {
  const ctx = useEvents();
  React.useEffect(() => {
    if (onMount) {
      onMount(ctx);
    }
  }, [ctx, onMount]);
  return (
    <Text testID={testID}>
      {ctx.isLoading ? 'loading' : ctx.error ? 'error' : 'ready'}
    </Text>
  );
};

// Interactive test consumer for triggering actions
const InteractiveConsumer = ({
  action,
  onResult,
}: {
  action: 'refresh' | 'add' | 'update' | 'delete' | 'markRequested' | 'unmarkRequested';
  onResult?: (result: unknown) => void;
}) => {
  const ctx = useEvents();
  const [status, setStatus] = React.useState('idle');

  const handleAction = async () => {
    setStatus('pending');
    try {
      let result: unknown;
      if (action === 'refresh') {
        await ctx.refreshEvents();
        result = ctx.events;
      } else if (action === 'add') {
        result = await ctx.addUserEvent({
          title: 'New Event',
          location: 'Test Location',
          time: '14:00',
          eventDate: new Date().toISOString().split('T')[0],
          gender: 'Any',
          minAge: 18,
          maxAge: 50,
          groupType: 'Single',
          coverKey: 'badminton',
          userId: mockAuthUser.id,
          hostName: mockAuthUser.name,
        });
      } else if (action === 'update') {
        await ctx.updateUserEvent('1', {
          title: 'Updated Event',
          location: 'Updated Location',
          time: '16:00',
          eventDate: new Date().toISOString().split('T')[0],
          gender: 'Any',
          minAge: 21,
          maxAge: 45,
          groupType: 'Group',
        });
        result = 'updated';
      } else if (action === 'delete') {
        await ctx.deleteUserEvent('1');
        result = 'deleted';
      } else if (action === 'markRequested') {
        ctx.markEventRequested('1');
        result = ctx.isEventRequested('1');
      } else if (action === 'unmarkRequested') {
        ctx.unmarkEventRequested('1');
        result = ctx.isEventRequested('1');
      }
      setStatus('success');
      if (onResult) {
        onResult(result);
      }
    } catch (err) {
      setStatus('error');
      if (onResult) {
        onResult(err);
      }
    }
  };

  return (
    <>
      <Text testID="status">{status}</Text>
      <Text testID="loading">{ctx.isLoading ? 'true' : 'false'}</Text>
      <Text testID="error">{ctx.error || 'none'}</Text>
      <Text testID="events-count">{ctx.events.length}</Text>
      <Button testID="action-button" title="Action" onPress={handleAction} />
    </>
  );
};

describe('EventsContext - Rendering Tests', () => {
  beforeEach(() => {
    fetchMock.resetMocks();
    mockRefreshSessionSilently.mockClear();
    mockAuthFetch.mockReset();
    mockAuthFetch.mockImplementation((...args: Parameters<typeof fetch>) => fetch(...args));
    const mockUseAuth = require('../AuthContext').useAuth;
    mockUseAuth.mockReturnValue({
      user: mockAuthUser,
      token: mockToken,
      refreshSessionSilently: mockRefreshSessionSilently,
      authFetch: mockAuthFetch,
    });
    jest.clearAllTimers();
  });

  describe('Provider initialization', () => {
    it('should render provider with loading state initially', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      render(
        <EventsProvider>
          <TestConsumer />
        </EventsProvider>
      );

      // Initial loading state
      expect(screen.getByTestId('consumer')).toBeTruthy();

      await waitFor(() => {
        expect(screen.getByTestId('consumer').props.children).toBe('ready');
      });
    });

    it('should throw error when useEvents is used outside provider', () => {
      // Suppress console.error for this test
      const originalError = console.error;
      console.error = jest.fn();

      expect(() => {
        render(<TestConsumer />);
      }).toThrow('useEvents must be used within an EventsProvider');

      console.error = originalError;
    });

    it('should fetch events on mount', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      render(
        <EventsProvider>
          <TestConsumer />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:8080/api/events',
          expect.objectContaining({
            headers: { Authorization: `Bearer ${mockToken}` },
          })
        );
      });
    });
  });

  describe('refreshEvents', () => {
    it('should update loading state during fetch', async () => {
      let resolveFetch: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      });
      fetchMock.mockImplementationOnce(() => fetchPromise);
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      // Wait for component to mount
      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      // Resolve the fetch
      await act(async () => {
        resolveFetch!(new Response(JSON.stringify(mockApiResponses.events.success)));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('consumer').props.children).toBe('ready');
      });
    });

    it('should update events state after successful fetch', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
        expect(capturedCtx!.events.length).toBeGreaterThan(0);
      });
    });

    it('should handle API errors gracefully', async () => {
      fetchMock.mockResponseOnce('', { status: 500 });
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      render(
        <EventsProvider>
          <TestConsumer />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('consumer').props.children).toBe('error');
      });
    });

    it('should handle network errors', async () => {
      fetchMock.mockRejectOnce(new Error('Network error'));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      render(
        <EventsProvider>
          <TestConsumer />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('consumer').props.children).toBe('error');
      });
    });

    it('should handle null data from API', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.nullData));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
        expect(capturedCtx!.events).toEqual([]);
      });
    });
  });

  describe('addUserEvent', () => {
    it('should add event and return event ID', async () => {
      // Initial fetch
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.empty));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      // Create event response
      fetchMock.mockResponseOnce(JSON.stringify({ id: 100 }), { status: 201 });
      // Refresh after create
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="add"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      // Wait for initial load
      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      // Trigger add action
      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('success');
      });

      expect(result).toBe('100');
    });

    it('should throw error when not authenticated', async () => {
      // Mock useAuth to return no token
      const mockUseAuth = require('../AuthContext').useAuth;
      mockUseAuth.mockReturnValue({
        user: mockAuthUser,
        token: null,
        refreshSessionSilently: mockRefreshSessionSilently,
        authFetch: mockAuthFetch,
      });

      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.empty));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="add"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('error');
      });

      expect(result).toBeInstanceOf(Error);
      expect((result as Error).message).toContain('signed in');
    });

    it('should handle API error with custom message', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.empty));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce(
        JSON.stringify({ error: 'Title is required' }),
        { status: 400 }
      );

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="add"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('error');
      });

      expect((result as Error).message).toBe('Title is required');
    });
  });

  describe('updateUserEvent', () => {
    it('should update event successfully', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce('', { status: 200 });
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="update"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('success');
      });

      expect(result).toBe('updated');
    });

    it('should throw error when not authenticated', async () => {
      const mockUseAuth = require('../AuthContext').useAuth;
      mockUseAuth.mockReturnValue({
        user: mockAuthUser,
        token: null,
        refreshSessionSilently: mockRefreshSessionSilently,
        authFetch: mockAuthFetch,
      });

      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="update"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('error');
      });

      expect((result as Error).message).toContain('signed in');
    });

    it('should handle API error on update', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce('', { status: 403 });

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="update"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('error');
      });

      expect((result as Error).message).toContain('403');
    });
  });

  describe('deleteUserEvent', () => {
    it('should delete event successfully', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce('', { status: 200 });
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.empty));

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="delete"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('success');
      });

      expect(result).toBe('deleted');
    });

    it('should throw error when not authenticated', async () => {
      const mockUseAuth = require('../AuthContext').useAuth;
      mockUseAuth.mockReturnValue({
        user: mockAuthUser,
        token: null,
        refreshSessionSilently: mockRefreshSessionSilently,
        authFetch: mockAuthFetch,
      });

      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="delete"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('error');
      });

      expect((result as Error).message).toContain('signed in');
    });

    it('should handle API error on delete', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce('', { status: 404 });

      let result: unknown;
      render(
        <EventsProvider>
          <InteractiveConsumer
            action="delete"
            onResult={(r) => { result = r; }}
          />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('idle');
      });

      await act(async () => {
        fireEvent.press(screen.getByTestId('action-button'));
        jest.runAllTimers();
      });

      await waitFor(() => {
        expect(screen.getByTestId('status').props.children).toBe('error');
      });

      expect((result as Error).message).toContain('404');
    });
  });

  describe('isEventRequested / markEventRequested / unmarkEventRequested', () => {
    it('should mark event as requested', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      await act(async () => {
        await capturedCtx!.refreshRequestedEvents();
      });

      // Initially not requested
      expect(capturedCtx!.isEventRequested('1')).toBe(false);

      // Mark as requested
      act(() => {
        capturedCtx!.markEventRequested('1');
      });

      expect(capturedCtx!.isEventRequested('1')).toBe(true);
    });

    it('should unmark event as requested', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [{ event_id: 1 }] }));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [{ event_id: 1 }] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      await act(async () => {
        await capturedCtx!.refreshRequestedEvents();
      });

      expect(capturedCtx!.isEventRequested('1')).toBe(true);

      // Unmark
      act(() => {
        capturedCtx!.unmarkEventRequested('1');
      });

      expect(capturedCtx!.isEventRequested('1')).toBe(false);
    });

    it('should load requested events from API on mount', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({
        requests: [{ event_id: 1 }, { event_id: 2 }],
      }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
        expect(capturedCtx!.isEventRequested('1')).toBe(true);
        expect(capturedCtx!.isEventRequested('2')).toBe(true);
        expect(capturedCtx!.isEventRequested('3')).toBe(false);
      });
    });
  });

  describe('userEvents computed property', () => {
    it('should filter events by owner ID', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
        expect(capturedCtx!.userEvents.length).toBeGreaterThan(0);
      });

      // All user events should belong to the logged-in user
      capturedCtx!.userEvents.forEach((event) => {
        expect(event.ownerId).toBe(mockAuthUser.id);
      });
    });

    it('should return empty array when no user', async () => {
      const mockUseAuth = require('../AuthContext').useAuth;
      mockUseAuth.mockReturnValue({
        user: null,
        token: null,
        refreshSessionSilently: mockRefreshSessionSilently,
      });

      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
        expect(capturedCtx!.userEvents).toEqual([]);
      });
    });
  });

  describe('requestedEvents computed property', () => {
    it('should return events that user has requested to join', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({
        requests: [{ event_id: 2 }],
      }));
      fetchMock.mockResponseOnce(JSON.stringify({
        requests: [{ event_id: 2 }],
      }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      await act(async () => {
        await capturedCtx!.refreshRequestedEvents();
      });

      await waitFor(() => {
        expect(capturedCtx!.requestedEvents.length).toBe(1);
        expect(capturedCtx!.requestedEvents[0].id).toBe('2');
      });
    });

    it('should return empty array when no requested events', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      await act(async () => {
        await capturedCtx!.refreshRequestedEvents();
      });

      await waitFor(() => {
        expect(capturedCtx!.requestedEvents).toEqual([]);
      });
    });
  });

  describe('refreshRequestedEvents with authFetch', () => {
    it('should use authFetch result to populate requested events', async () => {
      mockAuthFetch.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/events')) {
          return new Response(JSON.stringify(mockApiResponses.events.success), { status: 200 });
        }
        if (url.endsWith('/api/chat/requests/me')) {
          return new Response(JSON.stringify({ requests: [{ event_id: 1 }] }), { status: 200 });
        }
        return new Response('{}', { status: 200 });
      });

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      await act(async () => {
        await capturedCtx!.refreshRequestedEvents();
      });

      await waitFor(() => {
        expect(capturedCtx!.requestedEvents.length).toBe(1);
        expect(capturedCtx!.requestedEvents[0].id).toBe('1');
      });
    });

    it('should handle 401 without logging requested-events fetch error', async () => {
      mockAuthFetch.mockImplementation(async (input: RequestInfo | URL) => {
        const url = String(input);
        if (url.endsWith('/api/events')) {
          return new Response(JSON.stringify(mockApiResponses.events.success), { status: 200 });
        }
        if (url.endsWith('/api/chat/requests/me')) {
          return new Response('', { status: 401 });
        }
        return new Response('{}', { status: 200 });
      });

      const consoleErrorMock = console.error as jest.Mock;
      consoleErrorMock.mockClear();

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      await act(async () => {
        await capturedCtx!.refreshRequestedEvents();
      });

      await waitFor(() => {
        expect(capturedCtx!.requestedEvents).toEqual([]);
      });

      const hasRequestedEventsError = consoleErrorMock.mock.calls.some(([message]) =>
        String(message).includes('Failed to fetch requested events')
      );
      expect(hasRequestedEventsError).toBe(false);
    });
  });

  describe('queueGuestEvent', () => {
    it('should queue event for later submission', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce(JSON.stringify({ id: 999 }), { status: 201 });
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      // Queue a guest event
      act(() => {
        capturedCtx!.queueGuestEvent({
          title: 'Guest Event',
          location: 'Guest Location',
          time: '12:00',
          eventDate: new Date().toISOString().split('T')[0],
          gender: 'Any',
          minAge: 18,
          maxAge: 50,
          groupType: 'Single',
          coverKey: 'badminton',
        });
      });

      // The guest event should be queued (internal state)
      // Since user is logged in, it will attempt to submit
      expect(capturedCtx!.queueGuestEvent).toBeDefined();
    });

    it('should preserve place metadata when submitting a queued guest event', async () => {
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));
      fetchMock.mockResponseOnce(JSON.stringify({ id: 1000 }), { status: 201 });
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
      });

      act(() => {
        capturedCtx!.queueGuestEvent({
          title: 'Guest Place Event',
          location: 'Koramangala SOCIAL',
          time: '12:00',
          eventDate: new Date().toISOString().split('T')[0],
          gender: 'Any',
          minAge: 18,
          maxAge: 50,
          groupType: 'Single',
          coverKey: 'badminton',
          placeId: 'place-koramangala-social',
          latitude: 12.9352,
          longitude: 77.6245,
        });
      });

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          'http://localhost:8080/api/events',
          expect.objectContaining({
            method: 'POST',
            body: expect.any(String),
          }),
        );
      });

      const createCall = fetchMock.mock.calls.find(
        ([url, init]) =>
          url === 'http://localhost:8080/api/events' &&
          init?.method === 'POST',
      );
      expect(createCall).toBeDefined();
      const body = JSON.parse(String(createCall?.[1]?.body));
      expect(body.place_id).toBe('place-koramangala-social');
      expect(body.latitude).toBe(12.9352);
      expect(body.longitude).toBe(77.6245);
    });
  });

  describe('error state handling', () => {
    it('should set error message on API failure', async () => {
      fetchMock.mockRejectOnce(new Error('Network failure'));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx).not.toBeNull();
        expect(capturedCtx!.error).toBe('Unable to load events. Pull to refresh.');
      });
    });

    it('should clear error on successful refresh', async () => {
      // First fetch fails
      fetchMock.mockRejectOnce(new Error('Network failure'));
      fetchMock.mockResponseOnce(JSON.stringify({ requests: [] }));

      let capturedCtx: EventsContextValue | null = null;
      render(
        <EventsProvider>
          <TestConsumer onMount={(ctx) => { capturedCtx = ctx; }} />
        </EventsProvider>
      );

      await waitFor(() => {
        expect(capturedCtx!.error).toBeTruthy();
      });

      // Second fetch succeeds
      fetchMock.mockResponseOnce(JSON.stringify(mockApiResponses.events.success));

      await act(async () => {
        await capturedCtx!.refreshEvents();
      });

      expect(capturedCtx!.error).toBeNull();
    });
  });
});

export {};
