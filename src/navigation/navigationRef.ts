import { createNavigationContainerRef } from "@react-navigation/native";

import { RootStackParamList } from "@navigation/types";

export const navigationRef =
  createNavigationContainerRef<RootStackParamList>();

export const resetToLogin = () => {
  if (!navigationRef.isReady()) {
    return;
  }

  navigationRef.reset({
    index: 0,
    routes: [{ name: "Main" }],
  });
};
