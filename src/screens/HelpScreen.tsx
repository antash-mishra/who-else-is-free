import { StyleSheet, Text, View } from "react-native";
import * as Haptics from "expo-haptics";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";

import ScreenContainer from "@components/ScreenContainer";
import ScreenHeader from "@components/ScreenHeader";
import ScalePressable from "@components/ScalePressable";
import ChevronRightIcon from "@assets/ui/chevron-right.svg";
import { typography } from "@theme/index";
import { RootStackParamList } from "@navigation/types";

const MenuItem = ({ label, onPress }: { label: string; onPress: () => void }) => (
  <ScalePressable
    pressableStyle={styles.menuItem}
    style={styles.menuItemInner}
    onPress={() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      onPress();
    }}
  >
    <Text style={styles.menuItemText}>{label}</Text>
    <ChevronRightIcon width={20} height={20} color="#808080" />
  </ScalePressable>
);

const HelpScreen = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <ScreenContainer edges={["top"]}>
      <ScreenHeader title="Help" onBack={navigation.goBack} />
      <View style={styles.menuList}>
        <MenuItem label="Contact us" onPress={() => navigation.navigate("HelpContact")} />
        <MenuItem label="FAQ" onPress={() => navigation.navigate("HelpFAQ")} />
        <MenuItem label="Feedback" onPress={() => navigation.navigate("HelpFeedback")} />
      </View>
    </ScreenContainer>
  );
};

const styles = StyleSheet.create({
  menuList: {
    paddingTop: 15,
  },
  menuItem: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#E6E6E6",
  },
  menuItemInner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 17,
  },
  menuItemText: {
    fontSize: 16,
    fontFamily: typography.fontFamilyRegular,
    letterSpacing: -0.3,
    color: "#000000",
  },
});

export default HelpScreen;
