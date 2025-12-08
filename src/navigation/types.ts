export type RootStackParamList = {
  Login:
    | {
        redirect?: {
          screen: keyof RootTabParamList;
          params?: RootTabParamList[keyof RootTabParamList];
        };
      }
    | undefined;
  Main: any;
  EventDetails: {
    eventId: string;
    origin?: 'Events' | 'MyEvents';
  };
  JoinRequests: {
    conversationId: number;
    eventId: number;
    title: string;
  };
  ChatThread: undefined;
};

export type RootTabParamList = {
  Events: undefined;
  MyEvents: undefined;
  Create: { editEventId?: string };
  Profile: undefined;
  Messages: undefined;
};
