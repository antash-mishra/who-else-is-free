import { type ReactNode, useMemo, useRef } from 'react';

import { Platform, StyleSheet, View } from 'react-native';

import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
  type BottomTabScreenProps,
} from '@react-navigation/bottom-tabs';
import {
  DefaultTheme,
  NavigationContainer,
  useNavigationState,
  type NavigationProp,
} from '@react-navigation/native';
import { CardStyleInterpolators, createStackNavigator } from '@react-navigation/stack';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { enableScreens } from 'react-native-screens';

import { BottomSheetHostProvider } from '@components/sheets';
import { navigationRef } from '@navigation/navigationRef';
import { EventDetailsOverlaySheet, PendingRequestsSheet } from '@navigation/SheetRoutes';
import { VibratingTabBarButton } from '@navigation/TabBarButton';
import {
  CreateTabIcon,
  EventsTabIcon,
  MessagesTabIcon,
  MyEventsTabIcon,
  ProfileTabIcon,
} from '@navigation/TabIcons';
import {
  sheetModalScreenOptions,
  slideFromBottomInterpolator,
  slideFromBottomTransitionSpec,
  slideFromRightInterpolator,
  slideFromRightTransitionSpec,
} from '@navigation/transitions';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import AdminSupportInboxScreen from '@screens/AdminSupportInboxScreen';
import AdminSupportSubmissionScreen from '@screens/AdminSupportSubmissionScreen';
import ChatThreadScreen from '@screens/ChatThreadScreen';
import CreateEventScreen from '@screens/CreateEventScreen';
import EditProfileScreen from '@screens/EditProfileScreen';
import EventDetailsScreen from '@screens/EventDetailsScreen';
import GoogleSignIn from '@screens/GoogleSignIn';
import HelpContactScreen from '@screens/HelpContactScreen';
import HelpFAQScreen from '@screens/HelpFAQScreen';
import HelpFeedbackScreen from '@screens/HelpFeedbackScreen';
import HelpScreen from '@screens/HelpScreen';
import HomeScreen from '@screens/HomeScreen';
import JoinRequestScreen from '@screens/JoinRequestScreen';
import MessagesScreen from '@screens/MessagesScreen';
import MyEventsScreen from '@screens/MyEventsScreen';
import NotificationsScreen from '@screens/NotificationsScreen';
import OnboardingScreen from '@screens/OnboardingScreen';
import OneToOneHubScreen from '@screens/OneToOneHubScreen';
import PastEventsScreen from '@screens/PastEventsScreen';
import PrivacyPolicyScreen from '@screens/PrivacyPolicyScreen';
import ProfileScreen from '@screens/ProfileScreen';
import SplashScreen from '@screens/SplashScreen';
import { trackScreenView } from '@services/analytics';
import { colors } from '@theme/colors';
import { Springs } from '@theme/springs';

// Render tab screens as plain JS Views so React Navigation's tabAnims-driven
// opacity (animation: "fade") applies correctly without native screen management
// interfering by removing screens from the hierarchy before the fade finishes.
enableScreens(false);

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

// ─── Tab screen wrappers ─────────────────────────────────────────────────────
type TabAccessibilityBoundaryProps = {
  routeName: keyof RootTabParamList;
  children: ReactNode;
};

const TabAccessibilityBoundary = ({ routeName, children }: TabAccessibilityBoundaryProps) => {
  const currentRouteName = useNavigationState((state) => state.routes[state.index]?.name);
  const isFocused = currentRouteName === routeName;

  return (
    <View
      style={[
        tabBarStyles.tabScene,
        !isFocused && Platform.OS === 'android' && tabBarStyles.tabSceneHidden,
      ]}
      collapsable={false}
      accessibilityElementsHidden={!isFocused}
      importantForAccessibility={isFocused ? 'auto' : 'no-hide-descendants'}
      pointerEvents={isFocused ? 'auto' : 'none'}
    >
      {children}
    </View>
  );
};

const EventsTab = (_props: BottomTabScreenProps<RootTabParamList, 'Events'>) => (
  <TabAccessibilityBoundary routeName="Events">
    <HomeScreen />
  </TabAccessibilityBoundary>
);
const MyEventsTab = (_props: BottomTabScreenProps<RootTabParamList, 'MyEvents'>) => (
  <TabAccessibilityBoundary routeName="MyEvents">
    <MyEventsScreen />
  </TabAccessibilityBoundary>
);
const MessagesTab = (_props: BottomTabScreenProps<RootTabParamList, 'Messages'>) => (
  <TabAccessibilityBoundary routeName="Messages">
    <MessagesScreen />
  </TabAccessibilityBoundary>
);
const ProfileTab = (_props: BottomTabScreenProps<RootTabParamList, 'Profile'>) => (
  <TabAccessibilityBoundary routeName="Profile">
    <ProfileScreen />
  </TabAccessibilityBoundary>
);

// ─── Tab bar background ──────────────────────────────────────────────────────
const TabBarBackground = () => (
  <View style={tabBarStyles.backgroundContainer}>
    <BlurView intensity={54} tint="light" style={StyleSheet.absoluteFill} />
    <View style={tabBarStyles.frostedOverlay} />
    <View style={tabBarStyles.topBorder} />
  </View>
);

const tabBarStyles = StyleSheet.create({
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: 'hidden',
  },
  tabScene: {
    flex: 1,
  },
  tabSceneHidden: {
    display: 'none',
  },
  frostedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.tabBarFrostedOverlay,
  },
  topBorder: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.background,
  },
});

// ─── Main tabs ───────────────────────────────────────────────────────────────
const MainTabs = () => {
  const insets = useSafeAreaInsets();

  const tabBarBaseStyle = useMemo(
    () => ({
      backgroundColor: 'transparent',
      height: 50 + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 8,
      position: 'absolute' as const,
      elevation: 0,
    }),
    [insets.bottom],
  );

  const tabButtons = useMemo(
    () => ({
      events: (props: BottomTabBarButtonProps) => (
        <VibratingTabBarButton {...props} pageIndex={0} />
      ),
      myEvents: (props: BottomTabBarButtonProps) => (
        <VibratingTabBarButton {...props} pageIndex={1} />
      ),
      create: (props: BottomTabBarButtonProps) => (
        <VibratingTabBarButton {...props} pageIndex={2} />
      ),
      messages: (props: BottomTabBarButtonProps) => (
        <VibratingTabBarButton {...props} pageIndex={3} />
      ),
      profile: (props: BottomTabBarButtonProps) => (
        <VibratingTabBarButton {...props} pageIndex={4} />
      ),
    }),
    [],
  );

  return (
    <Tab.Navigator
      screenOptions={() => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarStyle: tabBarBaseStyle,
        tabBarBackground: () => <TabBarBackground />,
        tabBarActiveTintColor: colors.activeTabIndicator,
        tabBarInactiveTintColor: colors.tabInactive,
        lazy: true,
        animation: 'none',
        detachInactiveScreens: false,
        sceneStyle: { backgroundColor: 'transparent' },
      })}
    >
      <Tab.Screen
        name="Events"
        component={EventsTab}
        options={{
          tabBarIcon: ({ focused, color }) => <EventsTabIcon focused={focused} color={color} />,
          tabBarButton: tabButtons.events,
        }}
      />
      <Tab.Screen
        name="MyEvents"
        component={MyEventsTab}
        options={{
          tabBarIcon: ({ focused, color }) => <MyEventsTabIcon focused={focused} color={color} />,
          tabBarButton: tabButtons.myEvents,
        }}
      />
      <Tab.Screen
        name="Create"
        component={View}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            navigation
              .getParent<NavigationProp<RootStackParamList>>()
              ?.navigate('CreateEvent', { editEventId: null });
          },
        })}
        options={{
          tabBarIcon: ({ focused, color }) => <CreateTabIcon focused={focused} color={color} />,
          tabBarButton: tabButtons.create,
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesTab}
        options={{
          tabBarIcon: ({ focused, color }) => <MessagesTabIcon focused={focused} color={color} />,
          tabBarButton: tabButtons.messages,
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileTab}
        options={{
          tabBarIcon: ({ focused, color }) => <ProfileTabIcon focused={focused} color={color} />,
          tabBarButton: tabButtons.profile,
        }}
      />
    </Tab.Navigator>
  );
};

// ─── Root navigator ──────────────────────────────────────────────────────────
const AppNavigator = () => {
  const routeNameRef = useRef<string | undefined>(undefined);
  const navigationTheme = {
    ...DefaultTheme,
    colors: {
      ...DefaultTheme.colors,
      background: colors.background,
      primary: colors.primary,
      card: colors.background,
      text: colors.text,
      border: colors.border,
    },
  };

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onReady={() => {
        routeNameRef.current = navigationRef.getCurrentRoute()?.name;
        if (routeNameRef.current) {
          trackScreenView(routeNameRef.current).catch(() => undefined);
        }
      }}
      onStateChange={() => {
        const currentRouteName = navigationRef.getCurrentRoute()?.name;
        if (currentRouteName && routeNameRef.current !== currentRouteName) {
          routeNameRef.current = currentRouteName;
          trackScreenView(currentRouteName).catch(() => undefined);
        }
      }}
    >
      <BottomSheetHostProvider>
        <Stack.Navigator
          initialRouteName="Splash"
          screenOptions={{
            headerShown: false,
            gestureEnabled: true,
            cardStyle: { backgroundColor: colors.background },
            cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
            transitionSpec: {
              open: { animation: 'spring' as const, config: Springs.snappy },
              close: { animation: 'spring' as const, config: Springs.snappy },
            },
          }}
        >
          <Stack.Screen
            name="Splash"
            component={SplashScreen}
            options={{
              cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
              cardStyle: { backgroundColor: colors.splashBackground },
            }}
          />
          <Stack.Screen
            name="Main"
            component={MainTabs}
            options={{
              gestureEnabled: false,
              cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
            }}
          />
          <Stack.Screen
            name="Login"
            component={GoogleSignIn}
            options={{
              presentation: 'transparentModal',
            }}
          />
          <Stack.Screen
            name="Onboarding"
            component={OnboardingScreen}
            options={{
              gestureEnabled: false,
              cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
            }}
          />
          <Stack.Screen
            name="EventDetails"
            component={EventDetailsScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="OneToOneHub"
            component={OneToOneHubScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="JoinRequest"
            component={JoinRequestScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="PendingRequests"
            component={PendingRequestsSheet}
            options={{
              presentation: 'transparentModal',
              ...sheetModalScreenOptions,
            }}
          />
          <Stack.Screen
            name="EventDetailsOverlay"
            component={EventDetailsOverlaySheet}
            options={{
              presentation: 'transparentModal',
              ...sheetModalScreenOptions,
            }}
          />
          <Stack.Screen
            name="CreateEvent"
            component={CreateEventScreen}
            options={{
              cardStyleInterpolator: slideFromBottomInterpolator,
              transitionSpec: slideFromBottomTransitionSpec,
            }}
          />
          <Stack.Screen
            name="EditProfile"
            component={EditProfileScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="PastEvents"
            component={PastEventsScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="Notifications"
            component={NotificationsScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="AdminSupportInbox"
            component={AdminSupportInboxScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="AdminSupportSubmission"
            component={AdminSupportSubmissionScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="PrivacyPolicy"
            component={PrivacyPolicyScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="Help"
            component={HelpScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="HelpContact"
            component={HelpContactScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="HelpFAQ"
            component={HelpFAQScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="HelpFeedback"
            component={HelpFeedbackScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
          <Stack.Screen
            name="ChatThread"
            component={ChatThreadScreen}
            options={{
              cardStyleInterpolator: slideFromRightInterpolator,
              transitionSpec: slideFromRightTransitionSpec,
            }}
          />
        </Stack.Navigator>
      </BottomSheetHostProvider>
    </NavigationContainer>
  );
};

export default AppNavigator;
