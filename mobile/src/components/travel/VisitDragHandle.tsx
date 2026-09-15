import Ionicons from "@expo/vector-icons/Ionicons";
import { memo, useMemo, useRef } from "react";
import { StyleSheet } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useSharedValue,
  type SharedValue,
} from "react-native-reanimated";

import { useTheme } from "@/hooks/use-theme";

export const VisitDragHandle = memo(function VisitDragHandle({
  id,
  absX,
  absY,
  ghostVisible,
  onDragStart,
  onDragEnd,
}: {
  id: string;
  absX: SharedValue<number>;
  absY: SharedValue<number>;
  ghostVisible: SharedValue<number>;
  onDragStart: (id: string) => void;
  onDragEnd: (id: string, x: number, y: number) => void;
}) {
  const theme = useTheme();
  const live = useSharedValue(0);
  const startRef = useRef(onDragStart);
  const endRef = useRef(onDragEnd);
  startRef.current = onDragStart;
  endRef.current = onDragEnd;

  const startJs = useMemo(
    () => (visitId: string) => {
      startRef.current(visitId);
    },
    []
  );
  const endJs = useMemo(
    () => (visitId: string, x: number, y: number) => {
      endRef.current(visitId, x, y);
    },
    []
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activateAfterLongPress(280)
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
          if (
            Math.abs(event.translationX) < 12 &&
            Math.abs(event.translationY) < 12
          ) {
            runOnJS(endJs)(id, Number.NaN, Number.NaN);
            return;
          }
          runOnJS(endJs)(id, event.absoluteX, event.absoluteY);
        }),
    [absX, absY, ghostVisible, id, live, startJs, endJs]
  );

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        accessibilityRole="button"
        accessibilityLabel="Arrastar no roteiro"
        hitSlop={6}
        style={styles.handle}
      >
        <Ionicons
          name="reorder-three-outline"
          size={22}
          color={theme.textSecondary}
        />
      </Animated.View>
    </GestureDetector>
  );
});

const styles = StyleSheet.create({
  handle: { paddingHorizontal: 2, paddingVertical: 6 },
});
