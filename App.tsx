import 'react-native-gesture-handler';

import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from '@navigation/AppNavigator';
import { colors } from '@theme/colors';
import { EventsProvider } from '@context/EventsContext';
import { AuthProvider } from '@context/AuthContext';
import { ChatProvider } from '@context/ChatContext';

const App = () => {
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold
  });

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <AuthProvider>
          <ChatProvider>
            <EventsProvider>
              <AppNavigator />
            </EventsProvider>
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
