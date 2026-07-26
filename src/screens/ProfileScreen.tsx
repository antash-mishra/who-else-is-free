import { useCallback, useEffect, useMemo, useState } from 'react';

import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { BottomTabNavigationProp } from '@react-navigation/bottom-tabs';
import {
  CompositeNavigationProp,
  RouteProp,
  useNavigation,
  useRoute,
} from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { LinearGradient } from 'expo-linear-gradient';

import TrashIcon from '@assets/account-icons/delete.svg';
import EditProfileIcon from '@assets/account-icons/edit.svg';
import HelpIcon from '@assets/account-icons/help.svg';
import LogoutIcon from '@assets/account-icons/logout.svg';
import PastEventsIcon from '@assets/account-icons/past event.svg';
import BellIcon from '@assets/notification/bell.svg';
import ScalePressable from '@components/ScalePressable';

import EventActionBadge from '@components/EventActionBadge';
import ScreenContainer from '@components/ScreenContainer';
import ChevronRightIcon from '@assets/ui/chevron-right.svg';
import SignInButtons from '@components/SignInButtons';
import { UnreadDot, IconButton } from '@components/ui';
import UserAvatar from '@components/UserAvatar';
import { useAuth } from '@context/AuthContext';
import { useChat } from '@context/ChatContext';
import { useEvents } from '@context/EventsContext';
import { useNotifications } from '@context/NotificationsContext';
import { logger } from '@services/logger';
import { colors, spacing, typography } from '@theme/index';
import { RootStackParamList, RootTabParamList } from '@navigation/types';
import BottomSheetModal from '@components/BottomSheetModal';
import EventActionOverlay from '@components/EventActionOverlay';
import PrivacyPolicyIcon from '@assets/account-icons/privacy.svg';
import { HapticFeedback, triggerHaptic } from '@services/haptics';
import { useAdminAccess } from '@hooks/useAdminAccess';

type ProfileNavigation = CompositeNavigationProp<
  BottomTabNavigationProp<RootTabParamList, 'Profile'>,
  StackNavigationProp<RootStackParamList>
>;

interface MenuItemProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  showChevron?: boolean;
  haptic?: HapticFeedback;
  testID?: string;
  isLast?: boolean;
}

const MenuItem = ({
  icon,
  label,
  onPress,
  showChevron = true,
  haptic = 'light',
  testID,
  isLast = false,
}: MenuItemProps) => {
  const handlePress = () => {
    triggerHaptic(haptic);
    onPress();
  };

  return (
    <ScalePressable
      pressableStyle={[styles.menuItem, isLast && styles.menuItemLast]}
      style={styles.menuItemInner}
      onPress={handlePress}
      testID={testID}
    >
      <View style={styles.menuItemLeft}>
        <View style={styles.menuIconContainer}>{icon}</View>
        <Text style={styles.menuItemText}>{label}</Text>
      </View>
      {showChevron && <ChevronRightIcon width={20} height={20} color={colors.subText} />}
    </ScalePressable>
  );
};

const ProfileScreen = () => {
  const { user, signOut, deleteAccount } = useAuth();
  const { events, userEvents } = useEvents();
  const { conversations } = useChat();
  const { unreadCount } = useNotifications();
  const { isAdmin } = useAdminAccess();
  const navigation = useNavigation<ProfileNavigation>();
  const route = useRoute<RouteProp<RootTabParamList, 'Profile'>>();
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showProfileUpdatedBadge, setShowProfileUpdatedBadge] = useState(false);

  useEffect(() => {
    if (route.params?.showProfileUpdatedBadge) {
      setShowProfileUpdatedBadge(true);
    }
  }, [route.params?.showProfileUpdatedBadge]);

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
    navigation.navigate('EditProfile');
  }, [navigation]);

  const handlePastEvents = useCallback(() => {
    navigation.navigate('PastEvents');
  }, [navigation]);

  const handlePrivacyPolicy = useCallback(() => {
    navigation.navigate('PrivacyPolicy');
  }, [navigation]);

  const handleHelp = useCallback(() => {
    navigation.navigate('Help');
  }, [navigation]);

  const handleSupportInbox = useCallback(() => {
    navigation.navigate('AdminSupportInbox');
  }, [navigation]);

  const handleDelete = useCallback(() => {
    setDeleteError(null);
    setShowDeleteConfirm(true);
  }, []);

  const handleDeleteCancel = useCallback(() => {
    if (isDeletingAccount) {
      return;
    }
    setDeleteError(null);
    setShowDeleteConfirm(false);
  }, [isDeletingAccount]);

  const handleDeleteAccount = useCallback(async () => {
    if (isDeletingAccount) {
      return;
    }

    try {
      setIsDeletingAccount(true);
      setDeleteError(null);
      await deleteAccount();
      setShowDeleteConfirm(false);
    } catch (error) {
      logger.error('Failed to delete account', error);
      setDeleteError(
        error instanceof Error ? error.message : 'Unable to delete account. Please try again.',
      );
    } finally {
      setIsDeletingAccount(false);
    }
  }, [deleteAccount, isDeletingAccount]);

  const [signInVisible, setSignInVisible] = useState(false);

  if (!user) {
    return (
      <ScreenContainer>
        <View style={styles.headerSpacing}>
          <Text style={styles.headerTitle}>Profile</Text>
        </View>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <LinearGradient
            colors={[
              colors.profileGradientStart,
              colors.profileGradientStart,
              colors.profileGradientEnd,
            ]}
            locations={[0, 0.42, 1]}
            start={{ x: 0.25, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.guestCard}
          >
            <Text style={styles.guestTitle}>No profile to show</Text>
            <Text style={styles.guestDescription}>Sign in to view your account</Text>
            <ScalePressable
              style={styles.guestButton}
              haptic="light"
              onPress={() => {
                setSignInVisible(true);
              }}
            >
              <Text style={styles.guestButtonText}>Continue</Text>
            </ScalePressable>
          </LinearGradient>
          <View style={styles.menuSection}>
            <MenuItem
              icon={<PrivacyPolicyIcon width={20} height={20} color={colors.text} />}
              label="Privacy Policy"
              onPress={handlePrivacyPolicy}
            />
            <MenuItem
              icon={<HelpIcon width={20} height={20} color={colors.text} />}
              label="Help"
              onPress={handleHelp}
              isLast
            />
          </View>
        </ScrollView>
        <BottomSheetModal visible={signInVisible} onClose={() => setSignInVisible(false)}>
          <SignInButtons />
        </BottomSheetModal>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <View style={styles.headerSpacing}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Account</Text>
          <View style={styles.bellContainer}>
            <IconButton
              accessibilityLabel="Notifications"
              testID="notifications-bell"
              icon={<BellIcon width={24} height={24} color={colors.text} />}
              onPress={() => navigation.navigate('Notifications')}
            />
            {unreadCount > 0 ? (
              <UnreadDot style={styles.bellBadge} testID="notifications-badge" />
            ) : null}
          </View>
        </View>
      </View>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Profile Header Card with Gradient */}
        <ScalePressable
          style={styles.headerCard}
          haptic="light"
          onPress={() => {
            handleEditProfile();
          }}
        >
          <LinearGradient
            colors={[
              colors.profileGradientStart,
              colors.profileGradientStart,
              colors.profileGradientEnd,
            ]}
            locations={[0, 0.42, 1]}
            start={{ x: 0.25, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerCardGradient}
          >
            <View style={styles.headerContent}>
              <UserAvatar
                avatar={user.avatar}
                name={user.name}
                seed={user.id}
                size={64}
                style={styles.avatar}
              />
              <Text style={styles.name}>{user?.name ?? 'Your Profile'}</Text>
              <Text style={styles.email}>{user?.email ?? ''}</Text>

              {/* Stats Row */}
              <View style={styles.statsRow}>
                <Text style={styles.statText}>
                  <Text style={styles.statNumber}>{hostedCount}</Text>
                  <Text style={styles.statLabel}> Hosted</Text>
                </Text>
                <View style={styles.statDot} />
                <Text style={styles.statText}>
                  <Text style={styles.statNumber}>{joinedCount}</Text>
                  <Text style={styles.statLabel}> Joined</Text>
                </Text>
              </View>
            </View>
          </LinearGradient>
        </ScalePressable>
        {/* Menu Section */}
        <View style={styles.menuSection}>
          <MenuItem
            icon={<EditProfileIcon width={20} height={20} color={colors.text} />}
            label="Edit Profile"
            onPress={handleEditProfile}
          />
          <MenuItem
            icon={<PastEventsIcon width={20} height={20} color={colors.text} />}
            label="Past Events"
            onPress={handlePastEvents}
          />
          <MenuItem
            icon={<PrivacyPolicyIcon width={20} height={20} color={colors.text} />}
            label="Privacy Policy"
            onPress={handlePrivacyPolicy}
          />
          <MenuItem
            icon={<HelpIcon width={20} height={20} color={colors.text} />}
            label="Help"
            onPress={handleHelp}
          />
          {isAdmin ? (
            <MenuItem
              icon={<HelpIcon width={20} height={20} color={colors.text} />}
              label="Support Inbox"
              onPress={handleSupportInbox}
              testID="admin-support-inbox-menu-item"
            />
          ) : null}
          <MenuItem
            icon={<LogoutIcon width={20} height={20} color={colors.text} />}
            label="Logout"
            onPress={handleSignOut}
            showChevron={false}
            haptic="medium"
          />
          <MenuItem
            icon={<TrashIcon width={20} height={20} color={colors.text} />}
            label="Delete"
            onPress={handleDelete}
            showChevron={false}
            haptic="destructive"
            isLast
          />
        </View>
      </ScrollView>
      <EventActionOverlay
        isVisible={showDeleteConfirm}
        onBackdropPress={handleDeleteCancel}
        type="confirm"
        title="Delete your account?"
        description="This will permanently delete your profile, hosted events, event memberships, and chats. This can't be undone."
        confirmLabel="Delete account"
        cancelLabel="Keep account"
        confirmTone="destructive"
        holdToConfirm
        onConfirm={handleDeleteAccount}
        onCancel={handleDeleteCancel}
        isConfirmLoading={isDeletingAccount}
        errorMessage={deleteError}
      />
      <EventActionBadge
        visible={showProfileUpdatedBadge}
        label="Profile updated"
        onHidden={() => {
          setShowProfileUpdatedBadge(false);
          navigation.setParams({ showProfileUpdatedBadge: false });
        }}
      />
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
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  bellContainer: {
    position: 'relative',
  },
  bellBadge: {
    position: 'absolute',
    // The IconButton is 44x44; the 24x24 bell SVG is centered inside it.
    // Position the dot at the top-right corner of the SVG icon, not the
    // button container, so it visually sits on the bell's upper-right.
    top: 10,
    right: 11,
    // Match the chat tab-bar unread dot: red fill with a white ring. RN draws
    // borders inside the box, so 10px outer (6px red fill + 2px ring each side)
    // keeps it the same size as the chat dot.
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
    borderColor: colors.background,
    backgroundColor: colors.tabBarUnreadDot,
  },
  headerTitle: {
    fontSize: typography.header,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    lineHeight: typography.lineHeight,
    letterSpacing: typography.letterSpacing,
  },
  headerCard: {
    borderRadius: 16,
    borderCurve: 'continuous',
    overflow: 'hidden',
  },
  headerCardGradient: {},
  headerContent: {
    alignItems: 'center',
    paddingTop: 24,
    paddingBottom: 24,
    paddingHorizontal: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  name: {
    fontSize: 20,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  email: {
    fontSize: 14,
    color: 'rgba(0,0,0,0.5)',
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.5,
    marginBottom: 24,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  statText: {
    fontSize: 16,
    letterSpacing: -0.3,
  },
  statNumber: {
    fontSize: 16,
    color: colors.text,
    fontFamily: typography.fontFamilyMedium,
    letterSpacing: -0.3,
  },
  statLabel: {
    fontSize: 16,
    color: 'rgba(0,0,0,0.5)',
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
  },
  menuSection: {
    paddingTop: 12,
  },
  menuItem: {
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  menuItemLast: {
    borderBottomWidth: 0,
  },
  menuItemInner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 17,
  },
  menuItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  menuIconContainer: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.4,
    color: colors.text,
  },
  guestCard: {
    borderRadius: 20,
    borderCurve: 'continuous',
    overflow: 'hidden',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: spacing.md,
  },
  guestAvatar: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#3345E9',
    marginBottom: 12,
  },
  guestTitle: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
    lineHeight: 20,
    letterSpacing: -0.5,
    textAlign: 'center',
    marginBottom: 6,
  },
  guestDescription: {
    fontSize: 15,
    fontFamily: typography.fontFamilyRegular,
    color: colors.iconColor,
    textAlign: 'center',
    lineHeight: 20,
    letterSpacing: -0.5,
    marginBottom: 16,
  },
  guestButton: {
    height: 52,
    borderRadius: 26,
    borderCurve: 'continuous',
    backgroundColor: colors.primaryButtonBackground,
    paddingHorizontal: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  guestButtonText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyMedium,
    color: colors.buttonText,
    lineHeight: 20,
    letterSpacing: -0.3,
  },
});

export default ProfileScreen;
