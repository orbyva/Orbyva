import { useMemo, useRef } from "react";
import { PanResponder, StyleSheet, View } from "react-native";
import Svg, { Ellipse, G, Path, Rect, Text as SvgText } from "react-native-svg";

import { ThemedText } from "@/components/themed-text";
import { Radius } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import type { NoteCanvasData } from "@/types/notes";

type Point = [number, number];

type CanvasElement = {
  id?: string;
  type?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  angle?: number;
  strokeColor?: string;
  backgroundColor?: string;
  strokeWidth?: number;
  isDeleted?: boolean;
  text?: string;
  fontSize?: number;
  points?: Point[];
};

function randomId(): string {
  return `c${Math.random().toString(36).slice(2, 10)}`;
}

function asElements(data: NoteCanvasData | null): CanvasElement[] {
  return (data?.elements ?? []).filter(
    (item): item is CanvasElement =>
      Boolean(item) && typeof item === "object" && !(item as CanvasElement).isDeleted
  );
}

function elementPath(points: Point[] | undefined, x: number, y: number): string {
  if (!points || points.length === 0) return "";
  return points
    .map(([px, py], index) => `${index === 0 ? "M" : "L"} ${x + px} ${y + py}`)
    .join(" ");
}

function bounds(elements: CanvasElement[]): {
  minX: number;
  minY: number;
  width: number;
  height: number;
} {
  if (elements.length === 0) {
    return { minX: 0, minY: 0, width: 320, height: 240 };
  }
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const el of elements) {
    const x = el.x ?? 0;
    const y = el.y ?? 0;
    const w = el.width ?? 0;
    const h = el.height ?? 0;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + w);
    maxY = Math.max(maxY, y + h);
    for (const [px, py] of el.points ?? []) {
      minX = Math.min(minX, x + px);
      minY = Math.min(minY, y + py);
      maxX = Math.max(maxX, x + px);
      maxY = Math.max(maxY, y + py);
    }
  }
  const pad = 24;
  return {
    minX: minX - pad,
    minY: minY - pad,
    width: Math.max(320, maxX - minX + pad * 2),
    height: Math.max(240, maxY - minY + pad * 2),
  };
}

function makeFreedraw(points: Point[], color: string): CanvasElement {
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    id: randomId(),
    type: "freedraw",
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
    strokeColor: color,
    backgroundColor: "transparent",
    strokeWidth: 2,
    points: points.map(([x, y]) => [x - minX, y - minY]),
  };
}

export function CanvasNote({
  data,
  editable,
  onChange,
}: {
  data: NoteCanvasData | null;
  editable?: boolean;
  onChange?: (next: NoteCanvasData) => void;
}) {
  const theme = useTheme();
  const elements = asElements(data);
  const view = useMemo(() => bounds(elements), [elements]);
  const stroke = useRef<Point[]>([]);
  const layout = useRef({ x: 0, y: 0, scale: 1 });

  const pan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => Boolean(editable),
        onMoveShouldSetPanResponder: () => Boolean(editable),
        onPanResponderGrant: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          stroke.current = [
            [
              view.minX + locationX / layout.current.scale,
              view.minY + locationY / layout.current.scale,
            ],
          ];
        },
        onPanResponderMove: (event) => {
          const { locationX, locationY } = event.nativeEvent;
          stroke.current.push([
            view.minX + locationX / layout.current.scale,
            view.minY + locationY / layout.current.scale,
          ]);
        },
        onPanResponderRelease: () => {
          if (stroke.current.length < 2 || !onChange) return;
          onChange({
            elements: [
              ...elements,
              makeFreedraw(stroke.current, theme.foreground),
            ],
          });
          stroke.current = [];
        },
      }),
    [editable, elements, onChange, theme.foreground, view.minX, view.minY]
  );

  return (
    <View
      style={[styles.wrap, { backgroundColor: theme.muted }]}
      onLayout={(event) => {
        const { width } = event.nativeEvent.layout;
        layout.current.scale = width / view.width;
      }}
      {...(editable ? pan.panHandlers : {})}
    >
      <Svg
        width="100%"
        height={Math.min(420, Math.max(240, view.height * 0.6))}
        viewBox={`${view.minX} ${view.minY} ${view.width} ${view.height}`}
      >
        {elements.map((el, index) => {
          const key = el.id ?? `el-${index}`;
          const strokeColor = el.strokeColor || theme.foreground;
          const fill =
            el.backgroundColor && el.backgroundColor !== "transparent"
              ? el.backgroundColor
              : "none";
          const sw = el.strokeWidth ?? 2;
          const x = el.x ?? 0;
          const y = el.y ?? 0;
          const w = el.width ?? 0;
          const h = el.height ?? 0;
          if (el.type === "ellipse") {
            return (
              <Ellipse
                key={key}
                cx={x + w / 2}
                cy={y + h / 2}
                rx={w / 2}
                ry={h / 2}
                stroke={strokeColor}
                fill={fill}
                strokeWidth={sw}
              />
            );
          }
          if (el.type === "text" && el.text) {
            return (
              <SvgText
                key={key}
                x={x}
                y={y + (el.fontSize ?? 20)}
                fill={strokeColor}
                fontSize={el.fontSize ?? 20}
              >
                {el.text}
              </SvgText>
            );
          }
          if (
            el.type === "freedraw" ||
            el.type === "line" ||
            el.type === "arrow" ||
            el.type === "draw"
          ) {
            const d = elementPath(el.points, x, y);
            if (!d) return null;
            return (
              <Path
                key={key}
                d={d}
                stroke={strokeColor}
                fill="none"
                strokeWidth={sw}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            );
          }
          return (
            <G key={key}>
              <Rect
                x={x}
                y={y}
                width={w}
                height={h}
                rx={4}
                stroke={strokeColor}
                fill={fill}
                strokeWidth={sw}
              />
            </G>
          );
        })}
      </Svg>
      {editable ? (
        <ThemedText type="small" themeColor="mutedForeground" style={styles.hint}>
          Arraste o dedo para desenhar. Desenhos do web aparecem aqui; formas
          complexas continuam editáveis no computador.
        </ThemedText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: Radius.xl,
    overflow: "hidden",
    minHeight: 240,
  },
  hint: { paddingHorizontal: 12, paddingBottom: 10 },
});
