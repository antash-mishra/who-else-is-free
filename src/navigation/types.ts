export type RootStackParamList = {
  Splash: undefined;
  Login:
    | {
        redirect?: {
          screen: keyof RootTabParamList;
          params?: RootTabParamList[keyof RootTabParamList];
        };
      }
    | undefined;
  Main: any;
  Onboarding: undefined;
  EventDetails: {
    eventId: string;
    origin?: 'Events' | 'MyEvents';
    showEventUpdatedBadge?: boolean;
  };
  JoinRequests: {
    conversationId: number;
    eventId: number;
    title: string;
    groupType?: "Single" | "Group";
    eventDetails?: {
      coverKey?: string;
      dateLabel: string;
      location: string;
      time: string;
    };
  };
  ChatThread: undefined;
};

export type RootTabParamList = {
  Events: {
    showEventReportedBadge?: boolean;
    showEventDeletedBadge?: boolean;
    showEventLeftBadge?: boolean;
  } | undefined;
  MyEvents: {
    showEventCreatedBadge?: boolean;
    showEventDeletedBadge?: boolean;
  } | undefined;
  Create: { editEventId?: string };
  Profile: undefined;
  Messages: undefined;
};
