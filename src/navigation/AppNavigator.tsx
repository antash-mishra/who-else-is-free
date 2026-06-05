import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import {
  createStackNavigator,
  CardStyleInterpolators,
} from "@react-navigation/stack";
import type { StackCardInterpolationProps } from "@react-navigation/stack";
import {
  Animated,
  Modal,
  Platform,
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
import Svg, { Circle, G, Path } from "react-native-svg";
import { BlurView } from "expo-blur";
import { enableScreens } from "react-native-screens";
import HomeScreen from "@screens/HomeScreen";
import CreateEventScreen from "@screens/CreateEventScreen";
import MyEventsScreen from "@screens/MyEventsScreen";
import MessagesScreen from "@screens/MessagesScreen";
import ChatThreadScreen from "@screens/ChatThreadScreen";
import ProfileScreen from "@screens/ProfileScreen";
import EventDetailsScreen from "@screens/EventDetailsScreen";
import SplashScreen from "@screens/SplashScreen";
import GoogleSignIn from "@screens/GoogleSignIn";
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
import HelpContactScreen from "@screens/HelpContactScreen";
import HelpFAQScreen from "@screens/HelpFAQScreen";
import HelpFeedbackScreen from "@screens/HelpFeedbackScreen";
import EventCreatedScreen from "@screens/EventCreatedScreen";
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
const slideFromRightInterpolator = ({ current, layouts }: StackCardInterpolationProps) => ({
  cardStyle: {
    transform: [{
      translateX: current.progress.interpolate({
        inputRange: [0, 1],
        outputRange: [layouts.screen.width, 0],
        extrapolate: 'clamp',
      }),
    }],
  },
});

const slideFromRightTransitionSpec = {
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
  close: { animation: 'spring' as const, config: Springs.elegant },
};

const sheetModalScreenOptions = Platform.select({
  android: {
    gestureEnabled: false,
    cardStyle: { backgroundColor: "transparent" },
    cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
  },
  default: {
    gestureEnabled: false,
    cardOverlayEnabled: true,
    cardStyle: { backgroundColor: "transparent" },
    cardStyleInterpolator: sheetModalInterpolator,
    transitionSpec: sheetModalTransitionSpec,
  },
});

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

const AndroidSheetRoute = ({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) => {
  if (Platform.OS !== "android") {
    return <SheetWrapper onClose={onClose}>{children}</SheetWrapper>;
  }

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
      transparent
      visible
    >
      <View style={tabBarStyles.androidSheetModalBackdrop}>
        <SheetWrapper onClose={onClose}>{children}</SheetWrapper>
      </View>
    </Modal>
  );
};

const EventDetailsOverlaySheet = (props: any) => (
  <AndroidSheetRoute onClose={() => props.navigation.goBack()}>
    <EventDetailsScreen {...props} />
  </AndroidSheetRoute>
);

const PendingRequestsSheet = (props: any) => (
  <AndroidSheetRoute onClose={() => props.navigation.goBack()}>
    <PendingRequestsScreen {...props} />
  </AndroidSheetRoute>
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
  androidSheetModalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)",
  },
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

const EventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox="-1.5 -1.5 26 26"
      fill="none"
    >
      <Path
        d="M11.1736 1.45571C11.7187 1.0456 12.466 1.04931 13.0085 1.46281C15.489 3.35338 22.3821 8.38046 22.5533 9.38231C23.4589 11.7647 23.1687 18.6122 20.7074 20.4582C19.4767 21.3811 4.70892 21.3811 3.47827 20.4582C1.01352 18.6122 0.705862 9.99763 1.62885 9.38231C2.00454 8.50621 8.69315 3.35338 11.1736 1.45571Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M12.0918 16.3047C13.8759 16.3047 15.3222 14.8583 15.3222 13.0742C15.3222 11.2901 13.8759 9.84375 12.0918 9.84375C10.3076 9.84375 8.86133 11.2901 8.86133 13.0742C8.86133 14.8583 10.3076 16.3047 12.0918 16.3047Z"
        fill={focused ? '#FFFFFF' : 'none'}
        stroke={focused ? 'none' : strokeColor}
        strokeWidth={2.15}
      />
    </Svg>
  );
};

const MyEventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox="-1.5 -1.5 26 26"
      fill="none"
    >
      <Path
        d="M12.1043 7.62467C13.8922 7.62467 15.3415 6.17535 15.3415 4.38753C15.3415 2.59971 13.8922 1.15039 12.1043 1.15039C10.3165 1.15039 8.86719 2.59971 8.86719 4.38753C8.86719 6.17535 10.3165 7.62467 12.1043 7.62467Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.15}
      />
      <Path
        d="M4.70292 5.31152C7.94006 14.5605 16.2641 14.5605 19.5013 5.31152L22.7384 7.16132C24.4341 8.08621 18.8847 19.4933 15.8017 20.5723C13.9519 21.3431 10.2523 21.3431 8.40251 20.5723C5.31951 19.4933 -0.229868 8.08621 1.46578 7.16132L4.70292 5.31152Z"
        fill={focused ? strokeColor : 'none'}
        stroke={strokeColor}
        strokeWidth={2.15}
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
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M11.1504 6.70605V15.5949"
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Path
        d="M6.70312 11.1514H15.592"
        stroke={strokeColor}
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </Svg>
  );
};

const MessagesTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const { hasUnseenMessages } = useChat();

  return (
    <View style={{ width: TAB_ICON_WIDTH, height: TAB_ICON_HEIGHT }}>
      <Svg
        width={TAB_ICON_WIDTH}
        height={TAB_ICON_HEIGHT}
        viewBox="-1.5 -1.5 26 26"
        fill="none"
      >
        <G transform="translate(1.2, 1.2)">
          <Path
            d="M10.2988 18.9727C15.5449 18.9727 19.7988 14.904 19.7988 9.88578C19.7988 4.86758 15.5449 0.798828 10.2988 0.798828C5.05272 0.798828 0.798828 4.86758 0.798828 9.88578C0.798828 12.2032 1.70555 14.3169 3.19811 15.9217C3.65411 16.4141 3.97922 17.0672 3.81666 17.7292C3.63866 18.453 3.30554 19.1253 2.84238 19.6953C3.21304 19.7648 3.58891 19.7994 3.96549 19.7988C5.31872 19.7988 6.57272 19.356 7.60188 18.6015C8.45688 18.8439 9.36255 18.9727 10.2988 18.9727Z"
            fill={focused ? strokeColor : 'none'}
            stroke={strokeColor}
            strokeWidth={2.15}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </G>
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

  if (!focused) {
    return (
      <Svg
        width={TAB_ICON_WIDTH}
        height={TAB_ICON_HEIGHT}
        viewBox="-1.5 -1.5 26 26"
        fill="none"
      >
        <Circle cx={11.5} cy={11.5} r={10.5} stroke={strokeColor} strokeWidth={2.15} />
        <Path
          d="M15.18 14.39C15.18 14.39 14.13 16.49 11.5 16.49C8.87 16.49 7.82 14.39 7.82 14.39"
          stroke={strokeColor}
          strokeWidth={2.15}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <Circle cx={14.13} cy={8.09} r={1.84} fill={strokeColor} />
        <Circle cx={8.87} cy={8.09} r={1.84} fill={strokeColor} />
      </Svg>
    );
  }

  return (
    <Svg
      width={TAB_ICON_WIDTH}
      height={TAB_ICON_HEIGHT}
      viewBox="-1.5 -1.5 26 26"
      fill="none"
    >
      <Circle cx={11.5} cy={11.5} r={10.5} fill={strokeColor} stroke={strokeColor} strokeWidth={2.15} />
      <Path
        d="M15.18 14.39C15.18 14.39 14.13 16.49 11.5 16.49C8.87 16.49 7.82 14.39 7.82 14.39"
        stroke="#FFFFFF"
        strokeWidth={2.15}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <Circle cx={14.13} cy={8.09} r={1.84} fill="#FFFFFF" />
      <Circle cx={8.87} cy={8.09} r={1.84} fill="#FFFFFF" />
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
            cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
          }}
        />
        <Stack.Screen
          name="Login"
          component={GoogleSignIn}
          options={{
            presentation: "transparentModal",
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
          name="JoinRequests"
          component={JoinRequestsScreen}
          options={{
            cardStyleInterpolator: slideFromRightInterpolator,
            transitionSpec: slideFromRightTransitionSpec,
          }}
        />
        <Stack.Screen
          name="PendingRequests"
          component={PendingRequestsSheet}
          options={{
            presentation: "transparentModal",
            ...sheetModalScreenOptions,
          }}
        />
        <Stack.Screen
          name="EventDetailsOverlay"
          component={EventDetailsOverlaySheet}
          options={{
            presentation: "transparentModal",
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
        <Stack.Screen
          name="EventCreated"
          component={EventCreatedScreen}
          options={{
            gestureEnabled: false,
            cardStyleInterpolator: CardStyleInterpolators.forNoAnimation,
            cardStyle: { backgroundColor: "#111" },
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};


export default AppNavigator;
