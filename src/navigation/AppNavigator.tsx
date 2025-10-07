import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';

import HomeScreen from '@screens/HomeScreen';
import CreateEventScreen from '@screens/CreateEventScreen';
import MessagesScreen from '@screens/MessagesScreen';
import ProfileScreen from '@screens/ProfileScreen';
import LoginScreen from '@screens/LoginScreen';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import EventIcon from '@assets/events.svg';
import MessagesIcon from '@assets/messages.svg';
import CreateIcon from '@assets/createIcon.svg';
import ProfileIcon from '@assets/profile.svg';
import { colors } from '@theme/colors';
import { useAuth } from '@context/AuthContext';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const MainTabs = () => (
  <Tab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarShowLabel: false,
      tabBarStyle:
        route.name === 'Create'
          ? { display: 'none' }
          : {
              backgroundColor: colors.background,
              height: 72,
              paddingBottom: 12,
              paddingTop: 12
            },
      tabBarBackground:
        route.name === 'Create'
          ? undefined
          : () => (
              <BlurView
                intensity={Platform.select({ ios: 44, android: 44, default: 44 })}
                tint={Platform.OS === 'ios' ? 'light' : 'default'}
                style={StyleSheet.absoluteFill}
              />
            ),
      tabBarActiveTintColor: colors.text,
      tabBarInactiveTintColor: colors.primary
    })}
  >
    <Tab.Screen
      name="Events"
      component={HomeScreen}
      options={{
        tabBarIcon: () => <EventIcon width={30} height={30} />
      }}
    />
    <Tab.Screen
      name="Messages"
      component={MessagesScreen}
      options={{
        tabBarIcon: () => <MessagesIcon width={30} height={30} />
      }}
    />
    <Tab.Screen
      name="Create"
      component={CreateEventScreen}
      options={{
        tabBarIcon: () => <CreateIcon width={30} height={30} />,
        tabBarStyle: { display: 'none' }
      }}
    />
    <Tab.Screen
      name="Profile"
      component={ProfileScreen}
      options={{
        tabBarIcon: () => <ProfileIcon width={30} height={30} />
      }}
    />
  </Tab.Navigator>
);

const AppNavigator = () => {
  const { user } = useAuth();

  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.navigationBackground,
      primary: colors.primary,
      card: colors.background,
      text: colors.text,
      border: colors.border
    }
  };

  return (
    <NavigationContainer theme={navigationTheme}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {user ? (
          <Stack.Screen name="Main" component={MainTabs} />
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
