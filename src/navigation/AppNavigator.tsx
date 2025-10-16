import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Platform, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Circle, Path } from 'react-native-svg';

import HomeScreen from '@screens/HomeScreen';
import CreateEventScreen from '@screens/CreateEventScreen';
import MyEventsScreen from '@screens/MyEventsScreen';
import MessagesScreen from '@screens/MessagesScreen';
import ProfileScreen from '@screens/ProfileScreen';
import LoginScreen from '@screens/LoginScreen';
import EventDetailsScreen from '@screens/EventDetailsScreen';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import { colors } from '@theme/colors';
import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';

const Tab = createBottomTabNavigator<RootTabParamList>();
const Stack = createNativeStackNavigator<RootStackParamList>();

type TabIconProps = {
  focused: boolean;
  color: string;
};

const TAB_ICON_WIDTH = 56;
const TAB_ICON_HEIGHT = 40;
const TAB_ICON_VIEW_BOX = '0 0 56 42';

const getFillColor = (focused: boolean) => (focused ? colors.tabActive : 'none');

const EventsTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);

  return (
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox={TAB_ICON_VIEW_BOX} fill="none">
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
        stroke={strokeColor}
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
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox={TAB_ICON_VIEW_BOX} fill="none">
      <Circle cx={28.5} cy={15} r={5} fill={fillColor} stroke={strokeColor} strokeWidth={2} />
      <Circle cx={21.5} cy={27} r={5} fill={fillColor} stroke={strokeColor} strokeWidth={2} />
      <Circle cx={35.5} cy={27} r={5} fill={fillColor} stroke={strokeColor} strokeWidth={2} />
    </Svg>
  );
};

const CreateTabIcon = ({ focused, color }: TabIconProps) => {
  const strokeColor = color;
  const fillColor = getFillColor(focused);

  return (
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox={TAB_ICON_VIEW_BOX} fill="none">
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
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox={TAB_ICON_VIEW_BOX} fill="none">
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
  const fillColor = getFillColor(focused);

  return (
    <Svg width={TAB_ICON_WIDTH} height={TAB_ICON_HEIGHT} viewBox={TAB_ICON_VIEW_BOX} fill="none">
      <Path
        d="M28.0002 10C30.511 10.0001 32.5677 11.9789 32.6935 14.459L32.7004 14.7002C32.6884 17.2424 30.7088 19.2902 28.1857 19.3877H28.1652C28.0524 19.3775 27.9408 19.377 27.8381 19.3848C25.2516 19.2695 23.3001 17.2212 23.3 14.7002C23.3 12.1085 25.4084 10 28.0002 10Z"
        fill={fillColor}
        stroke={strokeColor}  
        strokeWidth={2}
      />
      <Path
        d="M28.0179 22.9062C30.49 22.9063 32.9032 23.44 34.6879 24.4502C36.1874 25.2991 36.8554 26.314 36.9408 27.2549L36.9506 27.4414C36.9465 28.4318 36.2882 29.5206 34.6849 30.4395C32.8936 31.4607 30.4745 32 28.0004 32C25.5262 32 23.1072 31.4607 21.3158 30.4395L21.3129 30.4385L21.0228 30.2656C19.6265 29.3924 19.0502 28.3744 19.0502 27.4561C19.0503 26.4759 19.7061 25.3717 21.3236 24.4512L21.3246 24.4521C23.125 23.4404 25.5462 22.9062 28.0179 22.9062Z"
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={2}
      />
    </Svg>
  );
};

const TAB_BAR_BASE_STYLE = {
  backgroundColor: colors.background,
  height: 72,
  paddingBottom: 12,
  paddingTop: 12
};

const MainTabs = () => {
  const { activeConversationId } = useChat();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => {
        const hideTabBar = route.name === 'Create' || (route.name === 'Messages' && !!activeConversationId);

        return {
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: hideTabBar ? { display: 'none' } : TAB_BAR_BASE_STYLE,
          tabBarBackground: hideTabBar
            ? undefined
            : () => (
                <BlurView
                  intensity={Platform.select({ ios: 44, android: 44, default: 44 })}
                  tint={Platform.OS === 'ios' ? 'light' : 'default'}
                  style={StyleSheet.absoluteFill}
                />
              ),
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive
        };
      }}
    >
      <Tab.Screen
        name="Events"
        component={HomeScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <EventsTabIcon focused={focused} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="MyEvents"
        component={MyEventsScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <MyEventsTabIcon focused={focused} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="Create"
        component={CreateEventScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <CreateTabIcon focused={focused} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="Messages"
        component={MessagesScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <MessagesTabIcon focused={focused} color={color} />
          )
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarIcon: ({ focused, color }) => (
            <ProfileTabIcon focused={focused} color={color} />
          )
        }}
      />
    </Tab.Navigator>
  );
};

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
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="EventDetails"
              component={EventDetailsScreen}
              options={{ headerShown: false }}
            />
          </>
        ) : (
          <Stack.Screen name="Login" component={LoginScreen} />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
