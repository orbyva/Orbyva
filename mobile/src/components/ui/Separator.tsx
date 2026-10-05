import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";

import { useTheme } from "@/hooks/use-theme";

export function Separator({
  orientation = "horizontal",
  style,
}: {
  orientation?: "horizontal" | "vertical";
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  return (
    <View
      style={[
        orientation === "horizontal" ? styles.horizontal : styles.vertical,
        { backgroundColor: theme.border },
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  horizontal: { height: StyleSheet.hairlineWidth, alignSelf: "stretch" },
  vertical: { width: StyleSheet.hairlineWidth, alignSelf: "stretch" },
});
