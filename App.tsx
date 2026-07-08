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
import { Platform, PermissionsAndroid, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import {
  AuthorizationStatus,
  getMessaging,
  hasPermission,
  isDeviceRegisteredForRemoteMessages,
  registerDeviceForRemoteMessages,
  requestPermission as requestMessagingPermission,
} from '@react-native-firebase/messaging';
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
import { logger } from '@services/logger';

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

    const requestPermission = async () => {
      try {
        const msg = getMessaging();

        if (Platform.OS === 'android' && Platform.Version >= 33) {
          await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS);
        }

        if (Platform.OS === 'ios') {
          if (!isDeviceRegisteredForRemoteMessages(msg)) {
            await registerDeviceForRemoteMessages(msg);
          }

          const currentStatus = await hasPermission(msg);
          if (currentStatus === AuthorizationStatus.NOT_DETERMINED) {
            const requestedStatus = await requestMessagingPermission(msg);
            const enabled =
              requestedStatus === AuthorizationStatus.AUTHORIZED ||
              requestedStatus === AuthorizationStatus.PROVISIONAL ||
              requestedStatus === AuthorizationStatus.EPHEMERAL;
            if (!enabled) {
              logger.warn('iOS push permission was not granted', {
                authStatus: requestedStatus,
              });
            }
          } else if (
            currentStatus !== AuthorizationStatus.AUTHORIZED &&
            currentStatus !== AuthorizationStatus.PROVISIONAL &&
            currentStatus !== AuthorizationStatus.EPHEMERAL
          ) {
            logger.warn(
              'iOS push permission already denied/restricted. System prompt will not show again until changed in Settings.',
              { authStatus: currentStatus },
            );
          }
          return;
        }

        await requestMessagingPermission(msg);
      } catch (err) {
        logger.warn('Initial push permission request failed', err);
      }
    };
    requestPermission();
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
