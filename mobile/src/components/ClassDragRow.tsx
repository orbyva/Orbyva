import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { ThemedText } from "@/components/themed-text";
import { useTheme } from "@/hooks/use-theme";

export const ClassDragRow = memo(function ClassDragRow({
  id,
  name,
  dragging,
  absX,
  absY,
  ghostVisible,
  onDragStart,
  onDragEnd,
}: {
  id: number;
  name: string;
  dragging: boolean;
  absX: SharedValue<number>;
  absY: SharedValue<number>;
  ghostVisible: SharedValue<number>;
  onDragStart: (id: number) => void;
  onDragEnd: (id: number, x: number, y: number) => void;
}) {
  const theme = useTheme();
  const live = useSharedValue(0);
  const startRef = useRef(onDragStart);
  const endRef = useRef(onDragEnd);
  startRef.current = onDragStart;
  endRef.current = onDragEnd;

  const startJs = useMemo(
    () => (classId: number) => {
      startRef.current(classId);
    },
    []
  );
  const endJs = useMemo(
    () => (classId: number, x: number, y: number) => {
      endRef.current(classId, x, y);
    },
    []
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(320)
        .onStart((event) => {
          live.value = 1;
          absX.value = event.absoluteX;
          absY.value = event.absoluteY;
          ghostVisible.value = 1;
          runOnJS(startJs)(id);
        })
        .onUpdate((event) => {
          absX.value = event.absoluteX;
          absY.value = event.absoluteY;
        })
        .onFinalize((event) => {
          if (live.value !== 1) return;
          live.value = 0;
          ghostVisible.value = 0;
          runOnJS(endJs)(id, event.absoluteX, event.absoluteY);
        }),
    [absX, absY, ghostVisible, id, live, startJs, endJs]
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[
          styles.row,
          {
            backgroundColor: theme.background,
            borderColor: theme.backgroundSelected,
            opacity: dragging ? 0.35 : 1,
          },
        ]}
      >
        <Animated.View style={styles.handle}>
          <Ionicons
            name="reorder-three-outline"
            size={22}
            color={theme.textSecondary}
          />
        </Animated.View>
        <ThemedText type="small" style={styles.name}>
          {name}
        </ThemedText>
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  row: {
    minHeight: 40,
    borderWidth: 1,
    borderRadius: 10,
    paddingRight: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  handle: { paddingHorizontal: 8, paddingVertical: 8 },
  name: { flex: 1 },
});
