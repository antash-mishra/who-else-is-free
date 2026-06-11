import type { NavigatorScreenParams } from '@react-navigation/native';

export type RootStackParamList = {
  Splash: undefined;
  Main: NavigatorScreenParams<RootTabParamList> | undefined;
  Onboarding: undefined;
  EventDetails: {
    eventId: string;
    origin?: 'Events' | 'MyEvents';
    showEventUpdatedBadge?: boolean;
    readOnly?: boolean;
  };
  EventDetailsOverlay: {
    eventId: string;
    readOnly: true;
  };
  JoinRequests: {
    conversationId: number;
    eventId: number;
    title: string;
    groupType?: 'Single' | 'Group';
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
  PrivacyPolicy: undefined;
  Help: undefined;
  HelpContact: undefined;
  HelpFAQ: undefined;
  HelpFeedback: undefined;
  Login: undefined;
  EventCreated: {
    eventTitle: string;
    coverUri: string;
    buttonLayout: { x: number; y: number; width: number; height: number };
    skipAnimation?: boolean;
  };
};

export type RootTabParamList = {
  Events:
    | {
        showEventReportedBadge?: boolean;
        showEventDeletedBadge?: boolean;
        showEventLeftBadge?: boolean;
      }
    | undefined;
  MyEvents:
    | {
        showEventCreatedBadge?: boolean;
        showEventDeletedBadge?: boolean;
      }
    | undefined;
  Create: { editEventId?: string | null };
  Profile: undefined;
  Messages: undefined;
};
