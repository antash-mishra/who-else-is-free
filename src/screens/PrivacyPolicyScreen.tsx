import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import ScreenContainer from "@components/ScreenContainer";
import ScreenHeader from "@components/ScreenHeader";
import { colors, spacing, typography } from "@theme/index";
import { RootStackParamList } from "@navigation/types";

const BODY_TEXT =
  "Lorem Ipsum is simply dummy text of the printing and typesetting industry. Lorem Ipsum has been the industry's standard dummy text ever since the 1500s, when an unknown printer took a galley of type and scrambled it to make a type specimen book. It has survived not only five centuries, but also the leap into electronic typesetting, remaining essentially unchanged. It was popularised in the 1960s with the release of Letraset sheets containing Lorem Ipsum passages, and more recently with desktop publishing software like Aldus PageMaker including versions of Lorem Ipsum.";

const PrivacyPolicyScreen = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScreenContainer>
      <ScreenHeader title="Privacy Policy" onBack={navigation.goBack} />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        <Text style={styles.bodyText}>{BODY_TEXT}</Text>
      </ScrollView>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  bodyText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    color: "#000000",
    lineHeight: 20,
    letterSpacing: -0.3,
  },
});

export default PrivacyPolicyScreen;
