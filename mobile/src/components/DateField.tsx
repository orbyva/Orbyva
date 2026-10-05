import DateTimePicker from "@react-native-community/datetimepicker";
import { useState } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useInputStyle } from "@/components/ui";
import { useOptionalThemeScheme } from "@/hooks/use-theme-preference";
import { useTheme } from "@/hooks/use-theme";
import { formatDateBR } from "@/lib/currency";

function isoToDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

function dateToIso(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function DateField({
  value,
  onChange,
  style,
  maximumDate,
  invalid,
}: {
  value: string;
  onChange: (iso: string) => void;
  style?: StyleProp<ViewStyle>;
  maximumDate?: string | null;
  invalid?: boolean;
}) {
  const theme = useTheme();
  const themeVariant = useOptionalThemeScheme();
  const field = useInputStyle({ invalid });
  const [open, setOpen] = useState(false);
  const date = isoToDate(value);
  const max = maximumDate ? isoToDate(maximumDate) : undefined;

  function onValueChange(_event: unknown, next: Date) {
    if (Platform.OS === "android") setOpen(false);
    onChange(dateToIso(next));
  }

  function onDismiss() {
    if (Platform.OS === "android") setOpen(false);
  }

  if (Platform.OS === "ios") {
    return (
      <View style={[field.container, styles.iosWrap, style]}>
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          locale="pt-BR"
          themeVariant={themeVariant}
          accentColor={theme.primary}
          onValueChange={onValueChange}
          onDismiss={onDismiss}
          maximumDate={max}
          style={styles.iosPicker}
        />
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={[field.container, style]}>
        <Text style={field.text}>{formatDateBR(value)}</Text>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="calendar"
          onValueChange={onValueChange}
          onDismiss={onDismiss}
          maximumDate={max}
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
