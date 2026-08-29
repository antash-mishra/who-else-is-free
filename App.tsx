import 'react-native-gesture-handler';

import { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
} from '@expo-google-fonts/inter';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import AppNavigator from '@navigation/AppNavigator';
import { navigationRef, resetToLogin } from '@navigation/navigationRef';
import { colors } from '@theme/colors';
import { BloomProvider } from '@context/BloomContext';
import { EventsProvider } from '@context/EventsContext';
import { AuthProvider } from '@context/AuthContext';
import { ChatProvider } from '@context/ChatContext';
import { PushProvider } from '@context/PushContext';
import { NotificationsProvider } from '@context/NotificationsContext';
import { CoversProvider } from '@context/CoversContext';
import { initializeAnalytics } from '@services/analytics';

// Prevent native splash from auto-hiding before fonts load
SplashScreen.preventAutoHideAsync();

const App = () => {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });

  useEffect(() => {
    initializeAnalytics().catch(() => undefined);
  }, []);

  const handleGuestEventSubmitted = useCallback(() => {
    if (navigationRef.isReady()) {
      navigationRef.navigate('Main', {
        screen: 'MyEvents',
        params: { showEventCreatedBadge: true },
      });
    }
  }, []);

  const handleSessionExpired = useCallback(() => {
    resetToLogin();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <KeyboardProvider>
        <SafeAreaProvider initialMetrics={initialWindowMetrics}>
          <StatusBar style="dark" />
          <BloomProvider>
            <AuthProvider onSessionExpired={handleSessionExpired}>
              <CoversProvider>
                <ChatProvider>
                  <NotificationsProvider>
                    <PushProvider>
                      <EventsProvider onGuestEventSubmitted={handleGuestEventSubmitted}>
                        <AppNavigator />
                      </EventsProvider>
                    </PushProvider>
                  </NotificationsProvider>
                </ChatProvider>
              </CoversProvider>
            </AuthProvider>
          </BloomProvider>
        </SafeAreaProvider>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

export default App;
