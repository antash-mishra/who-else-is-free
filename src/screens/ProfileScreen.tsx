import {
  Alert,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
import { useCallback } from "react";
import {
  CompositeNavigationProp,
  useNavigation,
} from "@react-navigation/native";
import { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { SafeAreaView } from "react-native-safe-area-context";
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
  const { userEvents } = useEvents();
  const { conversations } = useChat();
  const navigation = useNavigation<ProfileNavigation>();

  // Calculate stats
  const hostedCount = userEvents.length;
  const joinedCount = conversations.filter(
    (c) => c.eventId && c.createdBy !== user?.id
  ).length;

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

  if (!user) {
    return (
      <ScreenContainer edges={["bottom"]}>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <EmptyState
          title="No profile to show"
          description="Login to see the profile"
          actionLabel="Login"
          onActionPress={() => navigation.navigate("Login")}
          illustration={EmptyProfileIllustration}
          illustrationSize={40}
        />
      </ScreenContainer>
    );
  }

  const initial = user?.name?.charAt(0).toUpperCase() ?? "Y";

  return (
    <ScreenContainer edges={["bottom"]}>
      {/* Profile Header Card with Gradient - positioned to span full width */}
      <View style={styles.headerCardWrapper}>
        <LinearGradient
          colors={["#1B50E3", "#153DAD", "#081944", "#050F29"]}
          locations={[0, 0.3174, 0.601, 0.726]}
          style={styles.headerCard}
        >
          <SafeAreaView edges={["top"]} style={styles.headerContent}>
            <View style={styles.avatar}>
              <Text style={styles.avatarInitial}>{initial}</Text>
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
          </SafeAreaView>
        </LinearGradient>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Menu Section */}
        <View style={styles.menuSection}>
          <View style={styles.menuGroup}>
            <MenuItem
              icon={<EditProfileIcon width={18} height={18} />}
              label="Edit Profile"
              onPress={handleEditProfile}
            />
            <MenuItem
              icon={<PastEventsIcon width={18} height={18} />}
              label="Past Events"
              onPress={handlePastEvents}
            />
          </View>

          <View style={styles.menuGroup}>
            <MenuItem
              icon={<PrivacyPolicyIcon width={12} height={15} />}
              label="Privacy Policy"
              onPress={handlePrivacyPolicy}
            />
            <MenuItem
              icon={<HelpIcon width={15} height={15} />}
              label="Help"
              onPress={handleHelp}
            />
          </View>

          <View style={styles.menuGroup}>
            <MenuItem
              icon={<LogoutIcon width={15} height={14} />}
              label="Logout"
              onPress={handleSignOut}
              showChevron={false}
            />
            <MenuItem
              icon={<TrashIcon width={18} height={18} />}
              label="Delete"
              onPress={handleDelete}
              showChevron={false}
              destructive
            />
          </View>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    backgroundColor: "#F4F4F4",
    marginHorizontal: -spacing.md,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: spacing.md,
  },
  headerSpacing: {
    paddingTop: spacing.lg - spacing.md,
    paddingBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  headerCardWrapper: {
    width: SCREEN_WIDTH,
    marginLeft: -spacing.md,
  },
  headerCard: {
    overflow: "hidden",
  },
  headerContent: {
    alignItems: "center",
    paddingTop: spacing.xl,
    paddingBottom: spacing.xl + spacing.md,
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
    paddingTop: spacing.lg,
    gap: spacing.md,
  },
  menuGroup: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    overflow: "hidden",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E5E5E5",
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
