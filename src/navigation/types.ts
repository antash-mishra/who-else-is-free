export type RootStackParamList = {
  Login: undefined;
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
