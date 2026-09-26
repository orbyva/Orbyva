import { StyleSheet } from "react-native";

import { OrbChat } from "@/components/orb/OrbChat";
import { ThemedView } from "@/components/themed-view";

export default function OrbScreen() {
  return (
    <ThemedView style={styles.fill}>
      <OrbChat />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
