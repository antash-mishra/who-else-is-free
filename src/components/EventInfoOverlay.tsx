import React from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";

import { colors, spacing, typography } from "@theme/index";
import { COVER_OPTIONS } from "@constants/covers";

export type EventInfoOverlayProps = {
  isVisible: boolean;
  onClose: () => void;
  title: string;
  imageUri?: string;
  coverKey?: string;
  hostName?: string;
  dateLabel?: string;
  time?: string;
  location?: string;
  description?: string;
  audience?: string;
  groupType?: "Single" | "Group";
};

const getCoverSource = (coverKey?: string) => {
  const option = COVER_OPTIONS.find((item) => item.key === coverKey);
  return option?.source ?? COVER_OPTIONS[0].source;
};

const EventInfoOverlay: React.FC<EventInfoOverlayProps> = ({
  isVisible,
  onClose,
  title,
  imageUri,
  coverKey,
  hostName,
  dateLabel,
  time,
  location,
  description,
  audience,
  groupType,
}) => {
  const insets = useSafeAreaInsets();

  const imageSource = imageUri
    ? { uri: imageUri }
    : getCoverSource(coverKey);

  const scheduleParts = [dateLabel, time].filter(Boolean);
  const scheduleLine = scheduleParts.join(", ");

  const groupLabel = groupType === "Single" ? "1:1" : groupType === "Group" ? "Group" : "";
  const audienceParts = [groupLabel, audience].filter(Boolean);
  const audienceLine = audienceParts.join(", ");

  return (
    <Modal
      visible={isVisible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        {/* Hero cover image */}
        <View style={[styles.heroContainer, { paddingTop: insets.top }]}>
          <Image
            source={imageSource}
            style={styles.heroImage}
            resizeMode="cover"
          />
          <View style={styles.heroOverlay} />
          <Pressable
            onPress={onClose}
            style={[styles.closeIconButton, { top: insets.top + spacing.sm }]}
            accessibilityRole="button"
            accessibilityLabel="Close event details"
            hitSlop={8}
            testID="event-info-close-icon"
          >
            <Feather name="x" size={20} color="#FFFFFF" />
          </Pressable>
        </View>

        {/* Scrollable content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + spacing.xl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>{title}</Text>

          {hostName ? (
            <Text style={styles.hostedBy}>Hosted by {hostName}</Text>
          ) : null}

          <View style={styles.divider} />

          <Text style={styles.sectionHeading}>Details</Text>

          <View style={styles.detailsSection}>
            {location ? (
              <View style={styles.detailRow}>
                <Feather
                  name="map-pin"
                  size={16}
                  color={colors.iconColor}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{location}</Text>
              </View>
            ) : null}
            {scheduleLine ? (
              <View style={styles.detailRow}>
                <Feather
                  name="clock"
                  size={16}
                  color={colors.iconColor}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{scheduleLine}</Text>
              </View>
            ) : null}
            {audienceLine ? (
              <View style={styles.detailRow}>
                <Feather
                  name="users"
                  size={16}
                  color={colors.iconColor}
                  style={styles.detailIcon}
                />
                <Text style={styles.detailText}>{audienceLine}</Text>
              </View>
            ) : null}
          </View>

          {description ? (
            <Text style={styles.description}>{description}</Text>
          ) : null}

          {/* Close button */}
          <Pressable
            onPress={onClose}
            style={({ pressed }) => [
              styles.closeButton,
              pressed && styles.closeButtonPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Close"
            testID="event-info-close-button"
          >
            <Text style={styles.closeButtonLabel}>Close</Text>
          </Pressable>
        </ScrollView>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  heroContainer: {
    height: 220,
    overflow: "hidden",
    position: "relative",
  },
  heroImage: {
    ...StyleSheet.absoluteFillObject,
  },
  heroOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.25)",
  },
  closeIconButton: {
    position: "absolute",
    right: spacing.md,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    alignItems: "center",
    justifyContent: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
  },
  title: {
    fontSize: 22,
    fontFamily: typography.fontFamilyBold,
    color: colors.text,
    letterSpacing: -0.5,
  },
  hostedBy: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.subText,
  },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.sm,
  },
  sectionHeading: {
    fontSize: typography.subtitle,
    fontFamily: typography.fontFamilySemiBold,
    color: colors.text,
    marginBottom: spacing.xs,
  },
  detailsSection: {
    gap: spacing.sm,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailIcon: {
    marginRight: spacing.sm,
  },
  detailText: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.eventDetailRowText,
    flex: 1,
  },
  description: {
    fontSize: typography.body,
    fontFamily: typography.fontFamilyRegular,
    color: colors.text,
    lineHeight: 22,
    marginTop: spacing.sm,
  },
  closeButton: {
    marginTop: spacing.lg,
    borderRadius: 999,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    alignItems: "center",
  },
  closeButtonPressed: {
    opacity: 0.7,
  },
  closeButtonLabel: {
    fontSize: 17,
    fontFamily: typography.fontFamilyMedium,
    color: colors.text,
  },
});

export default EventInfoOverlay;
