import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createStackNavigator, CardStyleInterpolators } from "@react-navigation/stack";
import type { StackCardInterpolationProps } from "@react-navigation/stack";
import {
  Animated,
  Pressable,
  TouchableOpacity,
  View,
  StyleSheet,
  useWindowDimensions,
} from "react-native";
import ReAnimated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { useMemo, useRef } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { BlurView } from "expo-blur";
import { enableScreens } from "react-native-screens";
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
import { Springs } from "@theme/springs";
import { useChat } from "@context/ChatContext";
import { trackScreenView } from "@services/analytics";
import JoinRequestsScreen from "@screens/JoinRequestsScreen";
import PendingRequestsScreen from "@screens/PendingRequestsScreen";
import EditProfileScreen from "@screens/EditProfileScreen";
import PastEventsScreen from "@screens/PastEventsScreen";
import PrivacyPolicyScreen from "@screens/PrivacyPolicyScreen";
import HelpScreen from "@screens/HelpScreen";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BottomTabBarButtonProps } from "@react-navigation/bottom-tabs";

// Render tab screens as plain JS Views so React Navigation's tabAnims-driven
// opacity (animation: "fade") applies correctly without native screen management
// interfering by removing screens from the hierarchy before the fade finishes.
enableScreens(false);

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();


// ─── Stack screen animation ───────────────────────────────────────────────────
// Push (open):  incoming slides from 30% right — matches tab animation
// Pop  (close): card slides fully off to the right — standard iOS back feel
const tabLikeInterpolator = ({ current, next, layouts, closing }: StackCardInterpolationProps) => {
  const { width } = layouts.screen;

  if (next) {
    // This card is below an incoming card: slide left + fade out
    return {
      cardStyle: {
        transform: [{
          translateX: next.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -width * 0.2], extrapolate: 'clamp' }),
        }],
        opacity: next.progress.interpolate({ inputRange: [0, 1], outputRange: [1, 0], extrapolate: 'clamp' }),
      },
    };
  }

  // Top card: open from 30% right, close to full width right
  const translateXOpen  = current.progress.interpolate({ inputRange: [0, 1], outputRange: [width * 0.3, 0], extrapolate: 'clamp' });
  const translateXClose = current.progress.interpolate({ inputRange: [0, 1], outputRange: [width, 0],       extrapolate: 'clamp' });

  // Blend: when closing=0 use open translation, when closing=1 use close translation
  const translateX = Animated.add(
    translateXOpen,
    Animated.multiply(closing, Animated.subtract(translateXClose, translateXOpen)),
  );

  return {
    cardStyle: {
      transform: [{ translateX }],
    },
  };
};

const tabLikeTransitionSpec = {
  open:  { animation: 'spring' as const, config: Springs.snappy },
  close: { animation: 'spring' as const, config: Springs.snappy },
};

// Full-screen slide-up modal — no background scaling/dimming
const slideFromBottomInterpolator = ({ current, layouts }: StackCardInterpolationProps) => ({
  cardStyle: {
    transform: [{
      translateY: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [layouts.screen.height, 0],
        extrapolate: 'clamp',
      }),
    }],
  },
});

const slideFromBottomTransitionSpec = {
  open:  { animation: 'spring' as const, config: Springs.snappy },
  close: { animation: 'spring' as const, config: Springs.snappy },
};

// Sheet modal: backdrop fades in place (overlayStyle, requires cardOverlayEnabled),
// transparent card slides up carrying the sheet content anchored to bottom.
// Matches BottomSheetModal behaviour exactly.
const sheetModalInterpolator = ({ current, layouts }: StackCardInterpolationProps) => ({
  overlayStyle: {
    opacity: current.progress.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 0.4],
      extrapolate: 'clamp',
    }),
  },
  cardStyle: {
    transform: [{
      translateY: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [layouts.screen.height, 0],
        extrapolate: 'clamp',
      }),
    }],
  },
});

const sheetModalTransitionSpec = {
  open:  { animation: 'spring' as const, config: Springs.bouncyUp },
  close: { animation: 'spring' as const, config: Springs.snappy },
};

// How far the sheet background extends below the screen.
// When the spring overshoots (translateY goes negative), the card's bottom
// edge rises above the actual screen bottom, exposing a gap. Extending the
// sheet background by this amount fills that gap with white instead of
// revealing the underlying screen.
const SHEET_BOUNCE_BUFFER = 80;

// Sheet modal wrapper.
// Backdrop and sheet are NON-OVERLAPPING siblings:
//   • Backdrop Pressable covers only the top 20% → tapping above sheet closes it
//   • Sheet View covers bottom 80% with explicit height → no touch interception
//     needed, so the inner ScrollView receives all gestures unimpeded.
// onStartShouldSetResponder is intentionally absent from the sheet — it would
// intercept touches at the JS bridge before the native UIScrollView can scroll.
const SheetWrapper = ({ children, onClose }: { children: React.ReactNode; onClose: () => void }) => {
  const { height: screenHeight } = useWindowDimensions();
  const sheetHeight = screenHeight * 0.8;
  return (
    <View style={{ flex: 1 }} pointerEvents="box-none">
      <Pressable
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: screenHeight - sheetHeight,
        }}
        onPress={onClose}
      />
      {/* Outer container extends SHEET_BOUNCE_BUFFER px below the screen so
          the bounce overshoot never exposes the underlying content. */}
      <View
        style={{
          position: 'absolute',
          bottom: -SHEET_BOUNCE_BUFFER,
          left: 0,
          right: 0,
          height: sheetHeight + SHEET_BOUNCE_BUFFER,
          backgroundColor: colors.background,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          overflow: 'hidden',
        }}
      >
        <View style={{ height: sheetHeight }}>
          {children}
        </View>
      </View>
    </View>
  );
};

const EventDetailsOverlaySheet = (props: any) => (
  <SheetWrapper onClose={() => props.navigation.goBack()}>
    <EventDetailsScreen {...props} />
  </SheetWrapper>
);

const PendingRequestsSheet = (props: any) => (
  <SheetWrapper onClose={() => props.navigation.goBack()}>
    <PendingRequestsScreen {...props} />
  </SheetWrapper>
);



// ─── Tab screen wrappers ─────────────────────────────────────────────────────
const EventsTab = (props: any) => <HomeScreen {...props} />;
const MyEventsTab = (props: any) => <MyEventsScreen {...props} />;
const MessagesTab = (props: any) => <MessagesScreen {...props} />;
const ProfileTab = (props: any) => <ProfileScreen {...props} />;

// ─── Tab bar background ──────────────────────────────────────────────────────
const TabBarBackground = () => (
  <View style={tabBarStyles.backgroundContainer}>
    <BlurView
      intensity={54}
      tint="light"
      style={StyleSheet.absoluteFill}
    />
    <View style={tabBarStyles.frostedOverlay} />
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

// ─── Tab icons ───────────────────────────────────────────────────────────────
type TabIconProps = {
  focused: boolean;
  color: string;
};

const TAB_ICON_WIDTH = 29;
const TAB_ICON_HEIGHT = 29;

const getFillColor = (focused: boolean) =>
  focused ? colors.activeTabIndicator : "none";

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
            top: 0,
            right: 2,
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

// ─── Vibrating tab bar button ────────────────────────────────────────────────
type VibratingTabBarButtonProps = BottomTabBarButtonProps & { pageIndex: number };

const VibratingTabBarButton = ({
  onPress,
  style,
  children,
  accessibilityLabel,
  testID,
}: VibratingTabBarButtonProps) => {
  const scale = useSharedValue(1);
  const animStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const handlePress = (e: Parameters<NonNullable<typeof onPress>>[0]) => {
    scale.value = 0.8;
    scale.value = withSpring(1, Springs.elegant);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    if (onPress) onPress(e);
  };

  return (
    <TouchableOpacity
      style={style}
      onPress={handlePress}
      activeOpacity={1}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      <ReAnimated.View style={animStyle}>
        {children}
      </ReAnimated.View>
    </TouchableOpacity>
  );
};

// ─── Main tabs ───────────────────────────────────────────────────────────────
const MainTabs = () => {
  const insets = useSafeAreaInsets();

  const tabBarBaseStyle = useMemo(
    () => ({
      backgroundColor: "transparent",
      height: 50 + insets.bottom,
      paddingBottom: insets.bottom,
      paddingTop: 8,
      position: "absolute" as const,
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
          lazy: false,
          animation: "none",
          detachInactiveScreens: false,
          sceneStyle: { backgroundColor: "transparent" },
        })}
      >
        <Tab.Screen
          name="Events"
          component={EventsTab}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <EventsTabIcon focused={focused} color={color} />
            ),
            tabBarButton: tabButtons.events,
          }}
        />
        <Tab.Screen
          name="MyEvents"
          component={MyEventsTab}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <MyEventsTabIcon focused={focused} color={color} />
            ),
            tabBarButton: tabButtons.myEvents,
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
            tabBarButton: tabButtons.create,
          }}
        />
        <Tab.Screen
          name="Messages"
          component={MessagesTab}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <MessagesTabIcon focused={focused} color={color} />
            ),
            tabBarButton: tabButtons.messages,
          }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileTab}
          options={{
            tabBarIcon: ({ focused, color }) => (
              <ProfileTabIcon focused={focused} color={color} />
            ),
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
        if (
          currentRouteName &&
          routeNameRef.current !== currentRouteName
        ) {
          routeNameRef.current = currentRouteName;
          trackScreenView(currentRouteName).catch(() => undefined);
        }
      }}
    >
      <Stack.Navigator
        initialRouteName="Splash"
        screenOptions={{
          headerShown: false,
          gestureEnabled: true,
          cardStyle: { backgroundColor: colors.background },
          cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
          transitionSpec: {
            open:  { animation: 'spring' as const, config: Springs.snappy },
            close: { animation: 'spring' as const, config: Springs.snappy },
          },
        }}
      >
        <Stack.Screen
          name="Splash"
          component={SplashScreen}
          options={{
            cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
            cardStyle: { backgroundColor: "#050F29" },
          }}
        />
        <Stack.Screen
          name="Main"
          component={MainTabs}
          options={{
            gestureEnabled: false,
            cardStyleInterpolator: CardStyleInterpolators.forFadeFromCenter,
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
            cardStyleInterpolator: tabLikeInterpolator,
            transitionSpec: tabLikeTransitionSpec,
          }}
        />
        <Stack.Screen
          name="JoinRequests"
          component={JoinRequestsScreen}
          options={{
            cardStyleInterpolator: slideFromBottomInterpolator,
            transitionSpec: slideFromBottomTransitionSpec,
          }}
        />
        <Stack.Screen
          name="PendingRequests"
          component={PendingRequestsSheet}
          options={{
            presentation: "transparentModal",
            gestureEnabled: false,
            cardOverlayEnabled: true,
            cardStyle: { backgroundColor: "transparent" },
            cardStyleInterpolator: sheetModalInterpolator,
            transitionSpec: sheetModalTransitionSpec,
          }}
        />
        <Stack.Screen
          name="EventDetailsOverlay"
          component={EventDetailsOverlaySheet}
          options={{
            presentation: "transparentModal",
            gestureEnabled: false,
            cardOverlayEnabled: true,
            cardStyle: { backgroundColor: "transparent" },
            cardStyleInterpolator: sheetModalInterpolator,
            transitionSpec: sheetModalTransitionSpec,
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
            cardStyleInterpolator: tabLikeInterpolator,
            transitionSpec: tabLikeTransitionSpec,
          }}
        />
        <Stack.Screen
          name="PastEvents"
          component={PastEventsScreen}
          options={{
            cardStyleInterpolator: tabLikeInterpolator,
            transitionSpec: tabLikeTransitionSpec,
          }}
        />
        <Stack.Screen
          name="PrivacyPolicy"
          component={PrivacyPolicyScreen}
          options={{
            cardStyleInterpolator: tabLikeInterpolator,
            transitionSpec: tabLikeTransitionSpec,
          }}
        />
        <Stack.Screen
          name="Help"
          component={HelpScreen}
          options={{
            cardStyleInterpolator: tabLikeInterpolator,
            transitionSpec: tabLikeTransitionSpec,
          }}
        />
        <Stack.Screen
          name="ChatThread"
          component={ChatThreadScreen}
          options={{
            cardStyleInterpolator: tabLikeInterpolator,
            transitionSpec: tabLikeTransitionSpec,
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};


export default AppNavigator;
