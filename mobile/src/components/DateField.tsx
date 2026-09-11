import DateTimePicker, {
  type DateTimePickerEvent,
} from "@react-native-community/datetimepicker";
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
}: {
  value: string;
  onChange: (iso: string) => void;
  style?: StyleProp<ViewStyle>;
  maximumDate?: string | null;
}) {
  const theme = useTheme();
  const themeVariant = useOptionalThemeScheme();
  const [open, setOpen] = useState(false);
  const date = isoToDate(value);
  const max = maximumDate ? isoToDate(maximumDate) : undefined;

  function onPick(event: DateTimePickerEvent, next?: Date) {
    if (Platform.OS === "android") {
      setOpen(false);
      if (event.type === "dismissed") return;
    }
    if (next) onChange(dateToIso(next));
  }

  if (Platform.OS === "ios") {
    return (
      <View style={[styles.iosWrap, style]}>
        <DateTimePicker
          value={date}
          mode="date"
          display="compact"
          locale="pt-BR"
          themeVariant={themeVariant}
          accentColor={theme.primary}
          onChange={onPick}
          maximumDate={max}
          style={styles.iosPicker}
        />
      </View>
    );
  }

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={style}>
        <ThemedText>{formatDateBR(value)}</ThemedText>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={date}
          mode="date"
          display="calendar"
          onChange={onPick}
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
