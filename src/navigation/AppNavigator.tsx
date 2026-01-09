import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import {
  Animated,
  TouchableOpacity,
  Vibration,
  View,
  StyleSheet,
} from "react-native";
import { useMemo, useRef } from "react";
import Svg, { Circle, G, Path } from "react-native-svg";
import { BlurView } from "expo-blur";
import { LinearGradient } from "expo-linear-gradient";

import HomeScreen from "@screens/HomeScreen";
import CreateEventScreen from "@screens/CreateEventScreen";
import MyEventsScreen from "@screens/MyEventsScreen";
import MessagesScreen from "@screens/MessagesScreen";
import ChatThreadScreen from "@screens/ChatThreadScreen";
import ProfileScreen from "@screens/ProfileScreen";
import LoginScreen from "@screens/LoginScreen";
import EventDetailsScreen from "@screens/EventDetailsScreen";
import SplashScreen from "@screens/SplashScreen";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import { colors } from "@theme/colors";
import GoogleSignIn from "@screens/GoogleSignIn";
import JoinRequestsScreen from "@screens/JoinRequestsScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

const TabBarBackground = () => (
  <View style={tabBarStyles.backgroundContainer}>
    <BlurView
      intensity={80}
      tint="light"
      style={StyleSheet.absoluteFill}
    />
    {/* Frosted white base with subtle warmth */}
    <LinearGradient
      colors={["rgba(255, 255, 255, 0.92)", "#FBFBFB99"]}
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={StyleSheet.absoluteFill}
    />
    <View style={tabBarStyles.topBorder} />
  </View>
);

const tabBarStyles = StyleSheet.create({
  backgroundContainer: {
    ...StyleSheet.absoluteFillObject,
    overflow: "hidden",
  },
  topBorder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: "rgba(255, 248, 235, 0.5)",
  },
});

type TabIconProps = {
  focused: boolean;
  color: string;
};

const TAB_ICON_WIDTH = 56;
const TAB_ICON_HEIGHT = 40;
const TAB_ICON_VIEW_BOX = "0 0 56 42";

const getFillColor = (focused: boolean) =>
  focused ? colors.activeTabIndicator : "none";

const VibratingTabBarButton = (props: BottomTabBarButtonProps) => {
  const { onPress, style, children, accessibilityLabel, testID } = props;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  const triggerWiggle = () => {
    rotateAnim.setValue(0);
    Animated.sequence([
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: -1,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 0.8,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: -0.8,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 0.5,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: -0.5,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 0.2,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(rotateAnim, {
        toValue: 0,
        duration: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    Vibration.vibrate(10);
    triggerWiggle();
    if (onPress) {
      onPress(e);
    }
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [-1, 1],
    outputRange: ["-10deg", "10deg"],
  });

  return (
    <TouchableOpacity
      style={style}
      onPress={handlePress}
      activeOpacity={1}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <Animated.View style={{ transform: [{ rotate: rotation }] }}>
        {children}
      </Animated.View>
    </TouchableOpacity>
  );
};

const EventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);
  const innerLineColor = focused ? "#FFFFFF" : strokeColor;

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox={TAB_ICON_VIEW_BOX}
      fill="none"
    >
      <Path
        d="M16.6316 20.9869V24.1579C16.6316 28.3261 16.6316 30.4101 17.9265 31.7051C19.2214 33 21.3055 33 25.4737 33H30.5263C34.6945 33 36.7786 33 38.0736 31.7051C39.3684 30.4101 39.3684 28.3261 39.3684 24.1579V20.9869C39.3684 18.8631 39.3684 17.8013 38.9189 16.8822C38.4693 15.963 37.6312 15.3111 35.9549 14.0073L33.4285 12.0424C30.8208 10.0141 29.5169 9 28 9C26.4831 9 25.1792 10.0141 22.5715 12.0424L20.0451 14.0073C18.3688 15.3111 17.5307 15.963 17.0811 16.8822C16.6316 17.8013 16.6316 18.8631 16.6316 20.9869Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M23.9316 27H31.9316"
        stroke={innerLineColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
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
      viewBox={TAB_ICON_VIEW_BOX}
      fill="none"
    >
      <Circle
        cx={28.5}
        cy={15}
        r={5}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
      />
      <Circle
        cx={21.5}
        cy={27}
        r={5}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
      />
      <Circle
        cx={35.5}
        cy={27}
        r={5}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
      />
    </Svg>
  );
};

const CreateTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox={TAB_ICON_VIEW_BOX}
      fill="none"
    >
      <Path
        d="M24 21H32"
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M28 17V25"
        stroke={strokeColor}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M16 21C16 11.118 18.118 9 28 9C37.882 9 40 11.118 40 21C40 30.882 37.882 33 28 33C18.118 33 16 30.882 16 21Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
      />
    </Svg>
  );
};

const MessagesTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox={TAB_ICON_VIEW_BOX}
      fill="none"
    >
      <Path
        d="M28.5 32C34.5751 32 39.5 27.0751 39.5 21C39.5 14.9249 34.5751 10 28.5 10C22.4249 10 17.5 14.9249 17.5 21C17.5 22.7597 17.9132 24.4228 18.6478 25.8977C18.843 26.2897 18.908 26.7377 18.7948 27.1607L18.1397 29.6094C17.8552 30.6723 18.8277 31.6447 19.8907 31.3604L22.3393 30.7052C22.7623 30.592 23.2103 30.657 23.6023 30.8521C25.0772 31.5868 26.7403 32 28.5 32Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
      />
    </Svg>
  );
};

const ProfileTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = focused ? color : "none";

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox={TAB_ICON_VIEW_BOX}
      fill="none"
    >
      <G transform="translate(14, 7)">
        <Path
          d="M5.45648 7.73145C10.3134 17.7381 17.6867 17.7381 22.4267 7.73145L25.5867 9.8381C24.5333 11.4181 21.1825 15.9963 20.1888 18.2655C19.2667 20.3714 18.74 23.0047 18.2134 24.5851C16.6334 25.638 11.3667 25.638 9.78674 24.5851C9.26008 23.0047 9.10273 20.5838 7.94357 18.2655C6.88984 16.1581 3.46678 11.4181 2.41345 9.8381L5.45648 7.73145Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <Circle
          cx={13.8837}
          cy={7.37024}
          r={3.745}
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2}
        />
      </G>
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
  const hiddenTabBarStyle = useMemo(
    () => ({
      height: 0,
      paddingTop: 0,
      paddingBottom: 0,
      borderTopWidth: 0,
      opacity: 0,
      position: "absolute" as const,
      pointerEvents: "none" as const,
    }),
    [],
  );

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const hideTabBar = route.name === "Create";

        return {
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: hideTabBar
            ? hiddenTabBarStyle
            : tabBarBaseStyle,
          tabBarBackground: () => <TabBarBackground />,
          tabBarActiveTintColor: colors.activeTabIndicator,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarButton: (props) => <VibratingTabBarButton {...props} />,
          lazy: true,
          freezeOnBlur: false,
          animation: "fade",
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
        component={CreateEventScreen}
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
    <NavigationContainer theme={navigationTheme}>
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
          name="EventDetails"
          component={EventDetailsScreen}
          options={{
            animation: "fade_from_bottom",
            animationDuration: 200,
          }}
        />
        <Stack.Screen
          name="JoinRequests"
          component={JoinRequestsScreen}
          options={{
            presentation: "modal",
            animation: "slide_from_bottom",
            animationDuration: 250,
          }}
        />
        <Stack.Screen
          name="ChatThread"
          component={ChatThreadScreen}
          options={{
            animation: "fade_from_bottom",
            animationDuration: 200,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
