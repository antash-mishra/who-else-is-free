import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  Animated,
  TouchableOpacity,
  View,
  StyleSheet,
} from "react-native";
import * as Haptics from "expo-haptics";
import { useMemo, useRef } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { BlurView } from "expo-blur";

import HomeScreen from "@screens/HomeScreen";
import CreateEventScreen from "@screens/CreateEventScreen";
import MyEventsScreen from "@screens/MyEventsScreen";
import MessagesScreen from "@screens/MessagesScreen";
import ChatThreadScreen from "@screens/ChatThreadScreen";
import ProfileScreen from "@screens/ProfileScreen";
import LoginScreen from "@screens/LoginScreen";
import EventDetailsScreen from "@screens/EventDetailsScreen";
import SplashScreen from "@screens/SplashScreen";
import OnboardingScreen from "@screens/OnboardingScreen";
import { navigationRef } from "@navigation/navigationRef";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { colors } from "@theme/colors";
import { useChat } from "@context/ChatContext";
import GoogleSignIn from "@screens/GoogleSignIn";
import JoinRequestsScreen from "@screens/JoinRequestsScreen";
import PendingRequestsScreen from "@screens/PendingRequestsScreen";
import EditProfileScreen from "@screens/EditProfileScreen";
import PastEventsScreen from "@screens/PastEventsScreen";
import PrivacyPolicyScreen from "@screens/PrivacyPolicyScreen";
import HelpScreen from "@screens/HelpScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TabBarBackground = () => (
  <View style={tabBarStyles.backgroundContainer}>
    <BlurView
      intensity={54}
      tint="light"
      style={StyleSheet.absoluteFill}
    />
    {/* Fill: #FBFBFB at 60% opacity */}
    <View style={tabBarStyles.frostedOverlay} />
    {/* Stroke on top: 1px solid white */}
    <View style={tabBarStyles.topBorder} />
  </View>
);

const tabBarStyles = StyleSheet.create({
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  frostedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(251, 251, 251, 0.6)",
  },
  topBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "#FFFFFF",
  },
});

type TabIconProps = {
  focused: boolean;
  color: string;
};

const TAB_ICON_WIDTH = 29;
const TAB_ICON_HEIGHT = 29;

const getFillColor = (focused: boolean) =>
  focused ? colors.activeTabIndicator : "none";

const VibratingTabBarButton = (props: BottomTabBarButtonProps) => {
  const { onPress, style, children, accessibilityLabel, testID } = props;
  const scaleAnim = useRef(new Animated.Value(1)).current;

  const triggerScale = () => {
    scaleAnim.setValue(1);
    Animated.sequence([
      Animated.timing(scaleAnim, {
        toValue: 0.8,
        duration: 67,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnim, {
        toValue: 1,
        duration: 67,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    triggerScale();
    if (onPress) {
      onPress(e);
    }
  };

  return (
    <TouchableOpacity
      style={style}
      onPress={handlePress}
      activeOpacity={1}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

const EventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox="-1.5 -1.5 26 26"
      fill="none"
    >
      <Path
        d="M11.1736 1.45571C11.7187 1.0456 12.466 1.04931 13.0085 1.46281C15.489 3.35338 22.3821 8.38046 22.5533 9.38231C23.4589 11.7647 23.1687 18.6122 20.7074 20.4582C19.4767 21.3811 4.70892 21.3811 3.47827 20.4582C1.01352 18.6122 0.705862 9.99763 1.62885 9.38231C2.00454 8.50621 8.69315 3.35338 11.1736 1.45571Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2.3}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12.0918 16.3047C13.8759 16.3047 15.3222 14.8583 15.3222 13.0742C15.3222 11.2901 13.8759 9.84375 12.0918 9.84375C10.3076 9.84375 8.86133 11.2901 8.86133 13.0742C8.86133 14.8583 10.3076 16.3047 12.0918 16.3047Z"
        fill={focused ? '#FFFFFF' : 'none'}
        stroke={focused ? 'none' : strokeColor}
        strokeWidth={2.3}
      />
    </Svg>
  );
};

const MyEventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox="-1.5 -1.5 26 26"
      fill="none"
    >
      <Path
        d="M12.1043 7.62467C13.8922 7.62467 15.3415 6.17535 15.3415 4.38753C15.3415 2.59971 13.8922 1.15039 12.1043 1.15039C10.3165 1.15039 8.86719 2.59971 8.86719 4.38753C8.86719 6.17535 10.3165 7.62467 12.1043 7.62467Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2.2}
      />
      <Path
        d="M4.70292 5.31152C7.94006 14.5605 16.2641 14.5605 19.5013 5.31152L22.7384 7.16132C24.4341 8.08621 18.8847 19.4933 15.8017 20.5723C13.9519 21.3431 10.2523 21.3431 8.40251 20.5723C5.31951 19.4933 -0.229868 8.08621 1.46578 7.16132L4.70292 5.31152Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

const CreateTabIcon = ({ focused: _focused, color }: TabIconProps) => {
  const strokeColor = color;

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox="-1.5 -1.5 26 26"
      fill="none"
    >
      <Circle
        cx={11.1504}
        cy={11.1504}
        r={10}
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11.1504 6.70605V15.5949"
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.70312 11.1514H15.592"
        stroke={strokeColor}
        strokeWidth={2.2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

const MessagesTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);
  const { hasUnseenMessages } = useChat();

  return (
    <View style={{ width: TAB_ICON_WIDTH, height: TAB_ICON_HEIGHT }}>
      <Svg
        width={TAB_ICON_WIDTH}
        height={TAB_ICON_HEIGHT}
        viewBox="-3 -3 30 31"
        fill="none"
      >
        <Path
          d="M13.1269 1.31458L12.5763 1.26109C12.0255 1.22242 11.4724 1.22706 10.9222 1.27683L10.8949 1.27998C8.1714 1.5868 5.78746 2.67148 3.93547 4.76442L3.57254 5.19657C1.81763 7.3797 0.998566 10.1694 1.29328 12.9553V12.9627C1.4485 14.346 1.94324 16.0764 2.82783 17.3239C3.02151 17.5971 3.20879 17.8467 3.37641 18.0697C3.54789 18.2979 3.69302 18.4914 3.82219 18.6738C4.08661 19.0476 4.21015 19.2798 4.26377 19.4595C4.31829 19.6422 4.34961 20.3896 3.5222 21.1388L1.84961 22.8896C2.10299 23.3356 3.44207 23.6987 4.3267 23.5617C5.21133 23.4248 6.12197 23.2344 7.03286 22.8937V22.8926C7.43404 22.7423 7.77407 22.5907 8.0461 22.472C8.33074 22.3477 8.52747 22.266 8.71321 22.2087C9.01398 22.1159 9.33594 22.0702 9.95091 22.2087C9.98551 22.2165 10.0206 22.2228 10.0558 22.2275C11.091 22.3683 11.9141 22.4318 13.0399 22.3041C17.7283 21.772 21.6528 17.976 22.2849 13.2805C22.6621 10.4926 21.9215 7.66818 20.2239 5.42522L20.2196 5.41893L19.8861 5.00671C18.175 2.98843 15.7725 1.66905 13.1385 1.31563L13.1269 1.31458Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2.6}
          strokeLinejoin="round"
        />
      </Svg>
      {hasUnseenMessages && (
        <View
          style={{
            position: "absolute",
            top: 5,
            right: 15,
            width: 10,
            height: 10,
            borderRadius: 5,
            backgroundColor: "#FF1519",
            borderWidth: 2,
            borderColor: "#FFFFFF",
          }}
        />
      )}
    </View>
  );
};

const ProfileTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const innerStroke = focused ? '#FFFFFF' : strokeColor;

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox="-1.5 -1.5 26 26"
      fill="none"
    >
      <Path
        d="M11.1504 21.1504C16.6732 21.1504 21.1504 16.6732 21.1504 11.1504C21.1504 5.62754 16.6732 1.15039 11.1504 1.15039C5.62754 1.15039 1.15039 5.62754 1.15039 11.1504C1.15039 16.6732 5.62754 21.1504 11.1504 21.1504Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.1}
        strokeLinejoin="round"
      />
      <Path
        d="M6.45117 8.6861C7.22796 7.30515 8.78153 7.30515 9.55831 8.6861"
        stroke={innerStroke}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
      <Path
        d="M12.666 8.6861C13.4428 7.30515 14.9964 7.30515 15.7732 8.6861"
        stroke={innerStroke}
        strokeWidth={2.1}
        strokeLinecap="round"
      />
      <Path
        d="M14.6504 14.6504C14.6504 14.6504 13.6504 16.6504 11.1504 16.6504C8.65039 16.6504 7.65039 14.6504 7.65039 14.6504"
        stroke={innerStroke}
        strokeWidth={2.1}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

const MainTabs = () => {
  const insets = useSafeAreaInsets();
  const tabBarBaseStyle = useMemo(
    () => ({
      backgroundColor: "transparent",
      height: 50 + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 8,
      position: "absolute" as const,
      // borderTopWidth: 3.18,
      // borderTopColor: "#FFFFFF",
      elevation: 0,
    }),
    [insets.bottom],
  );
  return (
    <Tab.Navigator
      screenOptions={() => {
        return {
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: tabBarBaseStyle,
          tabBarBackground: () => <TabBarBackground />,
          tabBarActiveTintColor: colors.activeTabIndicator,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarButton: (props) => <VibratingTabBarButton {...props} />,
          lazy: false,
          animation: "none",
          detachInactiveScreens: false,
          sceneStyle: { backgroundColor: colors.background },
        };
      }}
    >
      <Tab.Screen
        name="Events"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <EventsTabIcon focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <MyEventsTabIcon focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Create"
        component={View}
        listeners={({ navigation }) => ({
          tabPress: (e) => {
            e.preventDefault();
            (navigation as any).navigate("CreateEvent", { editEventId: null });
          },
        })}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <CreateTabIcon focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <MessagesTabIcon focused={focused} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <ProfileTabIcon focused={focused} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

const AppNavigator = () => {
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
    <NavigationContainer ref={navigationRef} theme={navigationTheme}>
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          contentStyle: { backgroundColor: colors.background },
          animation: "fade_from_bottom",
          animationDuration: 200,
        }}
      >
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{
            animation: "none",
            headerShown: false,
            contentStyle: { backgroundColor: "#050F29" },
          }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="Login"
          component={GoogleSignIn}
          options={{
            presentation: "transparentModal",
            animation: "fade",
            animationDuration: 150,
          }}
        />
        <Stack.Screen
          name="Onboarding"
          component={OnboardingScreen}
          options={{
            gestureEnabled: false,
            animation: "fade",
          }}
        />
        <Stack.Screen
          name="EventDetails"
          component={EventDetailsScreen}
          options={{
            animation: "slide_from_right",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="JoinRequests"
          component={JoinRequestsScreen}
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="PendingRequests"
          component={PendingRequestsScreen}
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="EventDetailsOverlay"
          component={EventDetailsScreen}
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="CreateEvent"
          component={CreateEventScreen}
          options={{
            animation: "slide_from_bottom",
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="EditProfile"
          component={EditProfileScreen}
          options={{
            animation: "slide_from_right",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="PastEvents"
          component={PastEventsScreen}
          options={{
            animation: "slide_from_right",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="PrivacyPolicy"
          component={PrivacyPolicyScreen}
          options={{
            animation: "slide_from_right",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="Help"
          component={HelpScreen}
          options={{
            animation: "slide_from_right",
            animationDuration: 350,
          }}
        />
        <Stack.Screen
          name="ChatThread"
          component={ChatThreadScreen}
          options={{
            animation: "slide_from_right",
            animationDuration: 350,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
