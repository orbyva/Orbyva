import { Image } from "expo-image";
import { useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

import { ThemedText } from "@/components/themed-text";
import { Colors, Radius } from "@/constants/theme";
import { diagramAspectRatio } from "@/domain/orb/bubbleLayout";
import { TypeScale } from "@/domain/ui/typography";
import { useTheme } from "@/hooks/use-theme";

const TABLE =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function utf8ToBase64(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let out = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i];
    const b = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const c = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += TABLE[a >> 2];
    out += TABLE[((a & 3) << 4) | (b >> 4)];
    out += i + 1 < bytes.length ? TABLE[((b & 15) << 2) | (c >> 6)] : "=";
    out += i + 2 < bytes.length ? TABLE[c & 63] : "=";
  }
  return out;
}

export function MermaidBlock({ source }: { source: string }) {
  const theme = useTheme();
  const [failed, setFailed] = useState(false);
  const [aspectRatio, setAspectRatio] = useState(() => diagramAspectRatio());
  const uri = useMemo(() => {
    const payload = JSON.stringify({
      code: source,
      mermaid: {
        theme: theme.background === Colors.dark.background ? "dark" : "neutral",
      },
    });
    return `https://mermaid.ink/svg/${utf8ToBase64(payload)}`;
  }, [source, theme.background]);

  if (failed) {
    return (
      <View
        style={[styles.fallback, { backgroundColor: theme.border }]}
      >
        <ThemedText type="small" themeColor="mutedForeground">
          Diagrama (prévia indisponível)
        </ThemedText>
        <Text style={[styles.code, { color: theme.foreground }]}>{source}</Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri }}
      style={[styles.image, { aspectRatio }]}
      contentFit="contain"
      onLoad={(event) =>
        setAspectRatio(diagramAspectRatio(event.source.width, event.source.height))
      }
      onError={() => setFailed(true)}
    />
  );
}

const styles = StyleSheet.create({
  image: { width: "100%", borderRadius: Radius.md },
  fallback: { borderRadius: Radius.md, padding: 10, gap: 6 },
  code: TypeScale.mono,
});
