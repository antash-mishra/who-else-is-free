import 'react-native-gesture-handler';

import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { Platform, PermissionsAndroid, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';
import messaging from '@react-native-firebase/messaging';

import AppNavigator from '@navigation/AppNavigator';
import { colors } from '@theme/colors';
import { EventsProvider } from '@context/EventsContext';
import { AuthProvider } from '@context/AuthContext';
import { ChatProvider } from '@context/ChatContext';
import { PushProvider } from '@context/PushContext';

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
    const requestPermission = async () => {
      try {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
          await PermissionsAndroid.request(
            PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
          );
        }
        const msg = messaging();
        await msg.requestPermission();
      } catch {
        // Firebase not available (e.g. Expo Go)
      }
    };
    requestPermission();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <ChatProvider>
            <PushProvider>
              <EventsProvider>
                <AppNavigator />
              </EventsProvider>
            </PushProvider>
          </ChatProvider>
        </AuthProvider>
      </SafeAreaProvider>
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
