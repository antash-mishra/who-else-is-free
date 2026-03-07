import {
  Alert,
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { useCallback, useMemo, useRef } from "react";
import {
  CompositeNavigationProp,
  useNavigation,
} from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { Feather } from "@expo/vector-icons";

import EmptyState from "@components/EmptyState";
import ScreenContainer from "@components/ScreenContainer";
import { colors, spacing, typography } from "@theme/index";
import { useAuth } from "@context/AuthContext";
import { useEvents } from "@context/EventsContext";
import { useChat } from "@context/ChatContext";
import { RootStackParamList, RootTabParamList } from "@navigation/types";
import EmptyProfileIllustration from "@assets/empty-profile.svg";
import EditProfileIcon from "@assets/edit-profile-icon-profile.svg";
import PastEventsIcon from "@assets/past-event-icon-profile.svg";
import PrivacyPolicyIcon from "@assets/privacy-policy-icon-profile.svg";
import HelpIcon from "@assets/help-icon-profile.svg";
import LogoutIcon from "@assets/logout-icon-profile.svg";
import TrashIcon from "@assets/trash-icon-profile.svg";

type ProfileNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, "Profile">,
  NativeStackNavigationProp<RootStackParamList>
>;

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
  destructive?: boolean;
}

const MenuItem = ({
  icon,
  label,
  onPress,
  showChevron = true,
  destructive = false,
}: MenuItemProps) => {
  const textColor = destructive ? "#E53935" : "#000000";

  return (
    <Pressable
      style={styles.menuItem}
      onPress={onPress}
      accessibilityRole="button"
    >
      <View style={styles.menuItemLeft}>
        {icon}
        <Text style={[styles.menuItemText, { color: textColor }]}>{label}</Text>
      </View>
      {showChevron && (
        <Feather name="chevron-right" size={20} color="#808080" />
      )}
    </Pressable>
  );
};

const ProfileScreen = () => {
  const { user, signOut } = useAuth();
  const { events, userEvents } = useEvents();
  const { conversations } = useChat();
  const navigation = useNavigation<ProfileNavigation>();

  // Calculate stats
  const hostedCount = userEvents.length;
  const joinedCount = useMemo(() => {
    if (!user) {
      return 0;
    }

    const activeEventIDs = new Set<number>();
    events.forEach((event) => {
      const eventID = Number(event.id);
      if (Number.isInteger(eventID) && eventID > 0) {
        activeEventIDs.add(eventID);
      }
    });

    const joinedEventIDs = new Set<number>();
    conversations.forEach((conversation) => {
      if (!conversation.eventId || conversation.eventId <= 0) {
        return;
      }
      if (conversation.createdBy === user.id) {
        return;
      }
      if (!activeEventIDs.has(conversation.eventId)) {
        return;
      }
      joinedEventIDs.add(conversation.eventId);
    });

    return joinedEventIDs.size;
  }, [conversations, events, user]);

  const handleSignOut = useCallback(() => {
    signOut();
  }, [signOut]);

  const handleEditProfile = useCallback(() => {
    Alert.alert("Edit Profile", "Coming Soon");
  }, []);

  const handlePastEvents = useCallback(() => {
    Alert.alert("Past Events", "Coming Soon");
  }, []);

  const handlePrivacyPolicy = useCallback(() => {
    Alert.alert("Privacy Policy", "Privacy Policy information will be available here.");
  }, []);

  const handleHelp = useCallback(() => {
    Alert.alert("Help", "Help & Support information will be available here.");
  }, []);

  const handleDelete = useCallback(() => {
    Alert.alert("Delete Account", "Coming Soon");
  }, []);

  const scaleAnim = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 0.97,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  const handlePressOut = useCallback(() => {
    Animated.timing(scaleAnim, {
      toValue: 1,
      duration: 100,
      useNativeDriver: true,
    }).start();
  }, [scaleAnim]);

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Account</Text>
        </View>
        <EmptyState
          title="No profile to show"
          description="Log in or sign up to see your profile"
          actionLabel="Log In"
          onActionPress={() => navigation.navigate("Login")}
          secondaryActionLabel="Sign Up"
          onSecondaryActionPress={() => navigation.navigate("Login")}
          illustration={EmptyProfileIllustration}
          illustrationSize={40}
        />
      </ScreenContainer>
    );
  }

  const initial = user?.name?.charAt(0).toUpperCase() ?? "Y";

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <Text style={styles.headerTitle}>Account</Text>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Card with Gradient */}
        <Pressable onPressIn={handlePressIn} onPressOut={handlePressOut}>
          <Animated.View style={[styles.headerCard, { transform: [{ scale: scaleAnim }] }]}>
            <LinearGradient
              colors={["#1B50E3", "#153DAD", "#081944", "#050F29"]}
              locations={[0, 0.3174, 0.601, 0.726]}
              style={styles.headerCardGradient}
            >
              <View style={styles.headerContent}>
                <View style={styles.avatar}>
                  {user.avatar ? (
                    <Image
                      source={{ uri: `data:image/jpeg;base64,${user.avatar}` }}
                      style={styles.avatarImage}
                    />
                  ) : (
                    <Text style={styles.avatarInitial}>{initial}</Text>
                  )}
                </View>
                <Text style={styles.name}>{user?.name ?? "Your Profile"}</Text>
                <Text style={styles.email}>{user?.email ?? ""}</Text>

                {/* Stats Row */}
                <View style={styles.statsRow}>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{hostedCount}</Text>
                    <Text style={styles.statLabel}>Hosted</Text>
                  </View>
                  <View style={styles.statItem}>
                    <Text style={styles.statNumber}>{joinedCount}</Text>
                    <Text style={styles.statLabel}>Joined</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </Animated.View>
        </Pressable>
        {/* Menu Section */}
        <View style={styles.menuSection}>
          <MenuItem
            icon={<EditProfileIcon width={20} height={20} />}
            label="Edit Profile"
            onPress={handleEditProfile}
          />
          <MenuItem
            icon={<PastEventsIcon width={20} height={20} />}
            label="Past Events"
            onPress={handlePastEvents}
          />
          <MenuItem
            icon={<PrivacyPolicyIcon width={20} height={20} />}
            label="Privacy Policy"
            onPress={handlePrivacyPolicy}
          />
          <MenuItem
            icon={<HelpIcon width={20} height={20} />}
            label="Help"
            onPress={handleHelp}
          />
          <MenuItem
            icon={<LogoutIcon width={20} height={20} />}
            label="Logout"
            onPress={handleSignOut}
            showChevron={false}
          />
          <MenuItem
            icon={<TrashIcon width={20} height={20} />}
            label="Delete"
            onPress={handleDelete}
            showChevron={false}
            destructive
          />
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    marginHorizontal: -spacing.md,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
  },
  headerSpacing: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  headerCard: {
    borderRadius: 20,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  headerCardGradient: {
    borderRadius: 20,
  },
  headerContent: {
    alignItems: "center",
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#9B8AFB",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing.md,
    overflow: "hidden",
  },
  avatarImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  avatarInitial: {
    fontSize: 32,
    color: "#FFFFFF",
    fontFamily: typography.fontFamilyBold,
  },
  name: {
    fontSize: 24,
    color: "#FFFFFF",
    fontFamily: typography.fontFamilySemiBold,
    letterSpacing: -1,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.62)",
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.5,
    marginBottom: spacing.lg,
  },
  statsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xl + spacing.md,
  },
  statItem: {
    alignItems: "center",
  },
  statNumber: {
    fontSize: 16,
    color: "#FFFFFF",
    fontFamily: typography.fontFamilyBold,
  },
  statLabel: {
    fontSize: 16,
    color: "#FFFFFF",
    fontFamily: typography.fontFamilyRegular,
  },
  menuSection: {
    paddingTop: 12,
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md + 2,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E6E6",
  },
  menuItemLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    lineHeight: 20,
    letterSpacing: -0.5,
    color: "#000000",
  },
});

export default ProfileScreen;
