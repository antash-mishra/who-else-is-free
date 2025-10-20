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
};

export type RootTabParamList = {
  Events: undefined;
  MyEvents: undefined;
  Messages: undefined;
  Create: { editEventId?: string };
  Profile: undefined;
};
