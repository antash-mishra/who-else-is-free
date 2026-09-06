import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Splash: undefined;
  Main: NavigatorScreenParams<RootTabParamList> | undefined;
  Onboarding: undefined;
  EventDetails: {
    sharedCover?: boolean;
    eventId: string;
    origin?: 'Events' | 'MyEvents';
    showEventUpdatedBadge?: boolean;
    readOnly?: boolean;
  };
  EventDetailsOverlay: {
    eventId: string;
    readOnly: true;
  };
  OneToOneHub: {
    conversationId: number;
    eventId: number;
    title: string;
  };
  JoinRequest: {
    conversationId?: number;
    eventId: number;
    title: string;
  };
  PendingRequests: {
    conversationId: number;
    eventId: number;
    includeApproved?: boolean;
  };
  ChatThread: undefined;
  CreateEvent: { editEventId?: string | null } | undefined;
  EditProfile: undefined;

  PastEvents: undefined;
  Notifications: undefined;
  PrivacyPolicy: undefined;
  Help: undefined;
  HelpContact: undefined;
  HelpFAQ: undefined;
  HelpFeedback: undefined;
  AdminSupportInbox: undefined;
  AdminSupportSubmission: { submissionId: number };
  Login: undefined;
};

export type RootTabParamList = {
  Events:
    | {
        showEventReportedBadge?: boolean;
        showEventDeletedBadge?: boolean;
        showEventLeftBadge?: boolean;
        showWelcomeBadge?: boolean;
        notificationNotice?: 'event_unavailable' | 'access_unavailable';
      }
    | undefined;
  MyEvents:
    | {
        showEventCreatedBadge?: boolean;
        showEventDeletedBadge?: boolean;
      }
    | undefined;
  Create: { editEventId?: string | null };
  Profile: { showProfileUpdatedBadge?: boolean } | undefined;
  Messages: undefined;
};
