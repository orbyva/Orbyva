import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { ThemedText } from "@/components/themed-text";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";
import { useTheme } from "@/hooks/use-theme";

function parseHm(value: string): Date {
  const [h, m] = value.slice(0, 5).split(":").map(Number);
  const date = new Date();
  date.setHours(h || 0, m || 0, 0, 0);
  return date;
}

function formatHm(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function TimeField({
  value,
  onChange,
  style,
}: {
  value: string;
  onChange: (hhmm: string) => void;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const themeVariant = useOptionalThemeScheme();
  const [open, setOpen] = useState(false);
  const date = parseHm(value);

  function onValueChange(_event: unknown, next: Date) {
    if (Platform.OS === "android") setOpen(false);
    onChange(formatHm(next));
  }

  function onDismiss() {
    if (Platform.OS === "android") setOpen(false);
  }

  if (Platform.OS === "ios") {
    return (
      <View style={[styles.iosWrap, style]}>
        <DateTimePicker
          value={date}
          mode="time"
          display="compact"
          locale="pt-BR"
          themeVariant={themeVariant}
          accentColor={theme.primary}
          onValueChange={onValueChange}
          onDismiss={onDismiss}
          style={styles.iosPicker}
        />
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={style}>
        <ThemedText>{value.slice(0, 5)}</ThemedText>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="time"
          display="default"
          is24Hour
          onValueChange={onValueChange}
          onDismiss={onDismiss}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  iosWrap: {
    justifyContent: "center",
    alignItems: "flex-start",
    overflow: "hidden",
  },
  iosPicker: {
    alignSelf: "flex-start",
    marginLeft: -8,
  },
});
