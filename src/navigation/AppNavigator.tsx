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
import Svg, { Circle, G, Path } from "react-native-svg";
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

const TAB_ICON_WIDTH = 56;
const TAB_ICON_HEIGHT = 40;
const TAB_ICON_VIEW_BOX = "0 0 56 42";

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
        strokeWidth={2.6}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M23.9316 27H31.9316"
        stroke={innerLineColor}
        strokeWidth={2.6}
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
        strokeWidth={2.4}
      />
      <Circle
        cx={21.5}
        cy={27}
        r={5}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2.4}
      />
      <Circle
        cx={35.5}
        cy={27}
        r={5}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2.4}
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
      <G transform="translate(14, 7)">
        <Path
          d="M12.7002 24.2C19.0515 24.2 24.2002 19.0513 24.2002 12.7C24.2002 6.34874 19.0515 1.20001 12.7002 1.20001C6.34892 1.20001 1.2002 6.34874 1.2002 12.7C1.2002 19.0513 6.34892 24.2 12.7002 24.2Z" 
          stroke={strokeColor}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
        <Path
          d="M17.0098 12.6973H12.6973M12.6973 12.6973H8.38477M12.6973 12.6973V17.0098M12.6973 12.6973L12.6973 8.38477"
          stroke={strokeColor}
          strokeWidth={2.4}
          strokeLinecap="round"
        />
      </G>
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
      <G transform="translate(14, 7)">
        <Path
          fill-rule="evenodd" 
          clip-rule="evenodd" 
          d="M12.2112 1.20001C18.2822 1.19998 23.2231 6.14095 23.2231 12.212C23.2231 18.283 18.2822 23.2239 12.2112 23.2239C11.31 23.2226 10.4132 23.1041 9.54034 22.8846C8.20003 23.7243 6.36449 24.2578 3.92009 24.195C3.74068 24.1903 3.56669 24.1325 3.42021 24.0288C3.27373 23.9251 3.16134 23.7802 3.09732 23.6126C3.03329 23.4449 3.02051 23.262 3.06059 23.087C3.10067 22.9121 3.1918 22.753 3.32243 22.6299C4.41598 21.6005 4.76788 20.8988 4.87234 20.5542C4.88933 20.5008 4.8928 20.4703 4.89974 20.433C2.55565 18.3499 1.20238 15.3611 1.20005 12.2126C1.20001 6.14162 6.14016 1.19998 12.2112 1.20001Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2.3}
        />
      </G>
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
          d="M4.26547 5.3869C9.38936 15.9435 17.1679 15.9435 22.1684 5.3869L25.5021 7.60935C24.3909 9.27619 20.8559 14.106 19.8076 16.5C18.8348 18.7216 18.2792 21.4997 17.7235 23.167C16.0567 24.2777 10.5006 24.2777 8.83375 23.167C8.27813 21.4997 8.11214 18.9457 6.88926 16.5C5.77762 14.2767 2.1664 9.27619 1.05518 7.60935L4.26547 5.3869Z"
          fill={fillColor}
          stroke={strokeColor}
          strokeWidth={2.1}
          strokeLinejoin="round"
        />
        <Circle
          cx={13.1557}
          cy={5.00581}
          r={3.95085}
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
