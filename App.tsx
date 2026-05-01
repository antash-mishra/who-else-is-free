import 'react-native-gesture-handler';

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Platform, PermissionsAndroid, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider, initialWindowMetrics } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import messaging from '@react-native-firebase/messaging';
import { KeyboardProvider } from 'react-native-keyboard-controller';

import AppNavigator from '@navigation/AppNavigator';
import { colors } from '@theme/colors';
import { BloomProvider } from '@context/BloomContext';
import { EventsProvider } from '@context/EventsContext';
import { AuthProvider } from '@context/AuthContext';
import { ChatProvider } from '@context/ChatContext';
import { PushProvider } from '@context/PushContext';
import { initializeAnalytics } from '@services/analytics';

// Prevent native splash from auto-hiding before fonts load
SplashScreen.preventAutoHideAsync();

const App = () => {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold
  });

  useEffect(() => {
    initializeAnalytics().catch(() => undefined);

    const requestPermission = async () => {
      try {
        const msg = messaging();

        if (Platform.OS === 'android' && Platform.Version >= 33) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
        }

        if (Platform.OS === 'ios') {
          if (!msg.isDeviceRegisteredForRemoteMessages) {
            await msg.registerDeviceForRemoteMessages();
          }

          const currentStatus = await msg.hasPermission();
          if (currentStatus === messaging.AuthorizationStatus.NOT_DETERMINED) {
            const requestedStatus = await msg.requestPermission();
            const enabled =
              requestedStatus === messaging.AuthorizationStatus.AUTHORIZED ||
              requestedStatus === messaging.AuthorizationStatus.PROVISIONAL ||
              requestedStatus === messaging.AuthorizationStatus.EPHEMERAL;
            if (!enabled) {
              console.warn('iOS push permission was not granted', {
                authStatus: requestedStatus,
              });
            }
          } else if (
            currentStatus !== messaging.AuthorizationStatus.AUTHORIZED &&
            currentStatus !== messaging.AuthorizationStatus.PROVISIONAL &&
            currentStatus !== messaging.AuthorizationStatus.EPHEMERAL
          ) {
            console.warn(
              'iOS push permission already denied/restricted. System prompt will not show again until changed in Settings.',
              { authStatus: currentStatus }
            );
          }
          return;
        }

        await msg.requestPermission();
      } catch (err) {
        console.warn('Initial push permission request failed', err);
      }
    };
    requestPermission();
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
            <AuthProvider>
              <ChatProvider>
                <PushProvider>
                  <EventsProvider>
                    <AppNavigator />
                  </EventsProvider>
                </PushProvider>
              </ChatProvider>
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
    backgroundColor: colors.background
  }
});

export default App;
