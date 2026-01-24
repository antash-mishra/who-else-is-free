/**
 * Mock data for tests
 */

import type { ChatConversation, ChatMessage, ChatJoinRequest } from '@context/ChatContext';

// Auth types
export interface MockAuthUser {
  id: number;
  name: string;
  email: string;
  gender?: 'Female' | 'Male';
  age?: number;
  avatar?: string;
  profileComplete: boolean;
}

// User event type matching EventsContext
export interface MockUserEvent {
  id: string;
  title: string;
  location: string;
  time: string;
  audience: string;
  imageUri: string;
  badgeLabel?: string;
  dateLabel: 'Today' | 'Tmrw';
  eventDate: string;
  description?: string;
  ownerId: number;
  hostName: string;
  gender: string;
  minAge: number;
  maxAge: number;
  groupType: 'Single' | 'Group';
  coverKey?: string | null;
  scheduledAt?: string;
  createdAt?: string;
}

// Sample users
export const mockUsers: MockAuthUser[] = [
  {
    id: 1,
    name: 'Ava Test',
    email: 'ava@example.com',
    gender: 'Female',
    age: 25,
    profileComplete: true,
  },
  {
    id: 2,
    name: 'Liam Test',
    email: 'liam@example.com',
    gender: 'Male',
    age: 28,
    profileComplete: true,
  },
  {
    id: 3,
    name: 'New User',
    email: 'newuser@example.com',
    profileComplete: false,
  },
];

// Sample events
export const mockEvents: MockUserEvent[] = [
  {
    id: '1',
    title: 'Coffee Meetup',
    location: 'Central Park',
    time: '10:00',
    audience: 'Any gender, 18 to 35 years',
    imageUri: 'https://example.com/coffee.jpg',
    dateLabel: 'Today',
    eventDate: new Date().toISOString().split('T')[0],
    description: 'Casual coffee meetup',
    ownerId: 1,
    hostName: 'Ava Test',
    gender: 'Any',
    minAge: 18,
    maxAge: 35,
    groupType: 'Group',
    coverKey: 'coffee',
    createdAt: new Date().toISOString(),
  },
  {
    id: '2',
    title: 'Hiking Adventure',
    location: 'Mountain Trail',
    time: '08:00',
    audience: 'Any gender, 21 to 40 years',
    imageUri: 'https://example.com/hiking.jpg',
    dateLabel: 'Tmrw',
    eventDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    description: 'Morning hike',
    ownerId: 2,
    hostName: 'Liam Test',
    gender: 'Any',
    minAge: 21,
    maxAge: 40,
    groupType: 'Single',
    coverKey: 'hiking',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '3',
    title: 'Dinner Plans',
    location: 'Downtown Restaurant',
    time: '19:00',
    audience: 'Female, 25 to 35 years',
    imageUri: 'https://example.com/dinner.jpg',
    dateLabel: 'Today',
    eventDate: new Date().toISOString().split('T')[0],
    description: 'Nice dinner',
    ownerId: 1,
    hostName: 'Ava Test',
    gender: 'Female',
    minAge: 25,
    maxAge: 35,
    groupType: 'Group',
    coverKey: 'dinner',
    createdAt: new Date(Date.now() - 7200000).toISOString(),
  },
];

// Sample conversations
export const mockConversations: ChatConversation[] = [
  {
    id: 1,
    createdBy: 1,
    title: 'Coffee Meetup Chat',
    memberIds: [1, 2],
    participants: [
      { id: 1, name: 'Ava Test' },
      { id: 2, name: 'Liam Test' },
    ],
    displayName: 'Coffee Meetup Chat',
    unreadCount: 2,
    eventId: 1,
    event: {
      id: 1,
      title: 'Coffee Meetup',
      location: 'Central Park',
      time: '10:00',
      dateLabel: 'Today',
    },
  },
  {
    id: 2,
    createdBy: 2,
    title: null,
    memberIds: [1, 2],
    participants: [
      { id: 1, name: 'Ava Test' },
      { id: 2, name: 'Liam Test' },
    ],
    displayName: 'Liam Test',
    unreadCount: 0,
    eventId: null,
  },
];

// Sample messages
export const mockMessages: ChatMessage[] = [
  {
    id: '1',
    conversationId: 1,
    senderId: 1,
    body: 'Hello everyone!',
    createdAt: new Date(Date.now() - 3600000).toISOString(),
  },
  {
    id: '2',
    conversationId: 1,
    senderId: 2,
    body: 'Hi there! Looking forward to the meetup.',
    createdAt: new Date(Date.now() - 1800000).toISOString(),
  },
  {
    id: '3',
    conversationId: 1,
    senderId: 1,
    body: 'See you soon!',
    createdAt: new Date().toISOString(),
  },
];

// Sample pending message
export const mockPendingMessage: ChatMessage = {
  id: 'temp-123',
  conversationId: 1,
  senderId: 1,
  body: 'Sending...',
  createdAt: new Date().toISOString(),
  pending: true,
  tempId: 'temp-123',
};

// Sample failed message
export const mockFailedMessage: ChatMessage = {
  id: 'temp-456',
  conversationId: 1,
  senderId: 1,
  body: 'Failed to send',
  createdAt: new Date().toISOString(),
  pending: false,
  tempId: 'temp-456',
  failed: true,
};

// Sample join requests
export const mockJoinRequests: ChatJoinRequest[] = [
  {
    id: 1,
    eventId: 1,
    userId: 3,
    message: 'I would love to join!',
    status: 'pending',
    createdAt: new Date().toISOString(),
    requester: { id: 3, name: 'New User' },
  },
];

// API response fixtures
export const mockApiResponses = {
  events: {
    success: {
      data: mockEvents.map((e) => ({
        id: Number(e.id),
        title: e.title,
        location: e.location,
        time: e.time,
        description: e.description,
        gender: e.gender,
        min_age: e.minAge,
        max_age: e.maxAge,
        date_label: e.dateLabel,
        event_date: e.eventDate,
        group_type: e.groupType,
        user_id: e.ownerId,
        host_name: e.hostName,
        cover_key: e.coverKey,
        created_at: e.createdAt,
      })),
    },
    empty: { data: [] },
    nullData: { data: null },
  },
  googleLogin: {
    success: {
      user: {
        id: 1,
        name: 'Ava Test',
        email: 'ava@example.com',
        gender: 'Female',
        age: 25,
        profile_complete: true,
      },
      token: 'mock-jwt-token',
    },
    newUser: {
      user: {
        id: 3,
        name: 'New User',
        email: 'newuser@example.com',
        profile_complete: false,
      },
      token: 'mock-jwt-token-new',
    },
  },
  profile: {
    success: {
      user: {
        id: 1,
        name: 'Updated Name',
        email: 'ava@example.com',
        gender: 'Female',
        age: 26,
        profile_complete: true,
      },
    },
  },
  conversations: {
    success: {
      conversations: mockConversations.map((c) => ({
        id: c.id,
        created_by: c.createdBy,
        title: c.title,
        member_ids: c.memberIds,
        participants: c.participants,
        last_message: c.lastMessage
          ? {
              id: Number(c.lastMessage.id),
              sender_id: c.lastMessage.senderId,
              body: c.lastMessage.body,
              created_at: c.lastMessage.createdAt,
            }
          : undefined,
        unread_count: c.unreadCount,
        event: c.event
          ? {
              id: c.event.id,
              title: c.event.title,
              location: c.event.location,
              time: c.event.time,
              date_label: c.event.dateLabel,
            }
          : undefined,
      })),
    },
  },
  messages: {
    success: {
      messages: mockMessages.map((m) => ({
        id: Number(m.id),
        conversationId: m.conversationId,
        senderId: m.senderId,
        body: m.body,
        createdAt: m.createdAt,
      })),
    },
  },
};

// Helper to create a fresh event for today
export const createTodayEvent = (overrides: Partial<MockUserEvent> = {}): MockUserEvent => ({
  id: `test-${Date.now()}`,
  title: 'Test Event',
  location: 'Test Location',
  time: '14:00',
  audience: 'Any gender, 18 to 50 years',
  imageUri: 'https://example.com/test.jpg',
  dateLabel: 'Today',
  eventDate: new Date().toISOString().split('T')[0],
  ownerId: 1,
  hostName: 'Test Host',
  gender: 'Any',
  minAge: 18,
  maxAge: 50,
  groupType: 'Single',
  ...overrides,
});

// Helper to create a fresh event for tomorrow
export const createTomorrowEvent = (overrides: Partial<MockUserEvent> = {}): MockUserEvent => ({
  ...createTodayEvent(overrides),
  dateLabel: 'Tmrw',
  eventDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
  ...overrides,
});
