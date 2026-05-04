import { memo } from "react";
import {
  StyleProp,
  StyleSheet,
  Text,
  TextStyle,
  View,
  ViewStyle,
} from "react-native";
import { Image } from "expo-image";

import { typography } from "@theme/index";
import {
  getAvatarColor,
  getAvatarInitials,
  resolveAvatarUri,
} from "@utils/avatar";

interface UserAvatarProps {
  avatar?: string | null;
  name?: string | null;
  seed?: number | string | null;
  size?: number;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  maxInitials?: number;
  testID?: string;
}

const UserAvatar = ({
  avatar,
  name,
  seed,
  size = 40,
  style,
  textStyle,
  maxInitials = 1,
  testID,
}: UserAvatarProps) => {
  const avatarUri = resolveAvatarUri(avatar);
  const initials = getAvatarInitials(name, maxInitials);
  const backgroundColor = getAvatarColor(seed, name);
  const fontSize = Math.max(12, Math.round(size * 0.38));

  return (
    <View
      style={[
        styles.frame,
        { width: size, height: size, borderRadius: size / 2 },
        style,
        !avatarUri && { backgroundColor },
      ]}
      testID={testID}
    >
      {avatarUri ? (
        <Image
          source={{ uri: avatarUri }}
          style={styles.image}
          contentFit="cover"
          transition={150}
        />
      ) : (
        <View style={styles.initialsFrame}>
          <Text
            style={[styles.initials, { fontSize, lineHeight: size }, textStyle]}
            numberOfLines={1}
          >
            {initials}
          </Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  frame: {
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  image: {
    width: "100%",
    height: "100%",
  },
  initialsFrame: {
    width: "100%",
    height: "100%",
    alignItems: "center",
    justifyContent: "center",
  },
  initials: {
    color: "#FFFFFF",
    fontFamily: typography.fontFamilySemiBold,
    textAlign: "center",
    includeFontPadding: false,
    textAlignVertical: "center",
  },
});

export default memo(UserAvatar);
