import { type ReactNode } from "react";
import { Platform, StyleSheet, Text, View } from "react-native";

import { MermaidBlock } from "@/components/MermaidBlock";
import {
  indexNotesByTitle,
  normalizeWikiTitle,
  wikiLinkPlainSegments,
} from "@/domain/notes/wikiLinks";
import { useTheme } from "@/hooks/use-theme";

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/g;

export type WikiPreviewHandlers = {
  notes: { id: string; title: string }[];
  onOpen: (id: string) => void;
  onCreate: (title: string) => void;
};

function Marks({ text, color }: { text: string; color: string }) {
  const parts = text.split(INLINE);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith("**") && part.endsWith("**")) {
          return (
            <Text key={index} style={styles.bold}>
              {part.slice(2, -2)}
            </Text>
          );
        }
        if (part.startsWith("`") && part.endsWith("`")) {
          return (
            <Text key={index} style={styles.code}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        if (part.startsWith("*") && part.endsWith("*")) {
          return (
            <Text key={index} style={styles.italic}>
              {part.slice(1, -1)}
            </Text>
          );
        }
        return <Text key={index}>{part}</Text>;
      })}
    </>
  );
}

function Inline({
  text,
  color,
  wiki,
  style,
}: {
  text: string;
  color: string;
  wiki?: WikiPreviewHandlers;
  style?: object;
}) {
  if (!wiki) {
    return (
      <Text style={[styles.body, style, { color }]}>
        <Marks text={text} color={color} />
      </Text>
    );
  }
  const byTitle = indexNotesByTitle(wiki.notes);
  const segments = wikiLinkPlainSegments(text);
  return (
    <Text style={[styles.body, style, { color }]}>
      {segments.map((segment, index) => {
        if (segment.type === "text") {
          return <Marks key={index} text={segment.value} color={color} />;
        }
        const id = byTitle.get(normalizeWikiTitle(segment.title));
        return (
          <Text
            key={index}
            onPress={() =>
              id ? wiki.onOpen(id) : wiki.onCreate(segment.title)
            }
            style={styles.wiki}
          >
            {segment.title}
            {id ? "" : " +"}
          </Text>
        );
      })}
    </Text>
  );
}

export function MarkdownPreview({
  text,
  wiki,
}: {
  text: string;
  wiki?: WikiPreviewHandlers;
}) {
  const theme = useTheme();
  const color = theme.text;

  if (!text.trim()) {
    return (
      <Text style={[styles.body, { color: theme.textSecondary }]}>
        Nada para pré-visualizar.
      </Text>
    );
  }

  const blocks: { key: string; node: ReactNode }[] = [];
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  let fence = false;
  let fenceLang: string | null = null;
  let fenceLines: string[] = [];

  function flushFence(key: string) {
    const source = fenceLines.join("\n");
    if (fenceLang === "mermaid") {
      blocks.push({
        key,
        node: <MermaidBlock source={source} />,
      });
    } else {
      blocks.push({
        key,
        node: (
          <View
            style={[
              styles.codeWrap,
              { backgroundColor: theme.backgroundSelected },
            ]}
          >
            <Text style={[styles.codeBlock, { color }]}>
              {source || " "}
            </Text>
          </View>
        ),
      });
    }
    fenceLines = [];
    fenceLang = null;
  }

  lines.forEach((line, index) => {
    const key = `l${index}`;
    if (line.trimStart().startsWith("```")) {
      if (fence) {
        flushFence(key);
        fence = false;
      } else {
        fence = true;
        fenceLang = line.trimStart().slice(3).trim().toLowerCase() || null;
        fenceLines = [];
      }
      return;
    }
    if (fence) {
      fenceLines.push(line);
      return;
    }

    if (/^#{1,3} /.test(line)) {
      const level = line.startsWith("### ") ? 3 : line.startsWith("## ") ? 2 : 1;
      const heading = line.slice(level + 1);
      blocks.push({
        key,
        node: (
          <Inline
            text={heading}
            color={color}
            wiki={wiki}
            style={level === 1 ? styles.h1 : level === 2 ? styles.h2 : styles.h3}
          />
        ),
      });
      return;
    }

    const checklist = line.match(/^[-*] \[([ xX])\] (.*)$/);
    if (checklist) {
      const done = checklist[1] !== " ";
      blocks.push({
        key,
        node: (
          <View style={styles.row}>
            <Text style={[styles.mark, { color }]}>{done ? "☑" : "☐"}</Text>
            <View style={styles.rowBody}>
              <Inline text={checklist[2]} color={color} wiki={wiki} />
            </View>
          </View>
        ),
      });
      return;
    }

    const bullet = line.match(/^[-*] (.*)$/);
    if (bullet) {
      blocks.push({
        key,
        node: (
          <View style={styles.row}>
            <Text style={[styles.mark, { color }]}>•</Text>
            <View style={styles.rowBody}>
              <Inline text={bullet[1]} color={color} wiki={wiki} />
            </View>
          </View>
        ),
      });
      return;
    }

    const numbered = line.match(/^(\d+)\. (.*)$/);
    if (numbered) {
      blocks.push({
        key,
        node: (
          <View style={styles.row}>
            <Text style={[styles.mark, { color }]}>{numbered[1]}.</Text>
            <View style={styles.rowBody}>
              <Inline text={numbered[2]} color={color} wiki={wiki} />
            </View>
          </View>
        ),
      });
      return;
    }

    if (!line.trim()) {
      blocks.push({ key, node: <View style={styles.gap} /> });
      return;
    }

    blocks.push({
      key,
      node: <Inline text={line} color={color} wiki={wiki} />,
    });
  });

  if (fence) flushFence("fence-end");

  return (
    <View style={styles.stack}>
      {blocks.map((block) => (
        <View key={block.key}>{block.node}</View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: 10 },
  body: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
  },
  h1: { fontSize: 22, lineHeight: 28, fontWeight: "700" },
  h2: { fontSize: 18, lineHeight: 26, fontWeight: "700" },
  h3: { fontSize: 16, lineHeight: 24, fontWeight: "700" },
  bold: { fontWeight: "700" },
  italic: { fontStyle: "italic" },
  wiki: { color: "#0EA5E9", fontWeight: "700", textDecorationLine: "underline" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  mark: {
    width: 22,
    fontSize: 16,
    lineHeight: 24,
    fontWeight: "500",
  },
  rowBody: { flex: 1, minWidth: 0 },
  gap: { height: 8 },
  code: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 14,
  },
  codeBlock: {
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    fontSize: 13,
    lineHeight: 20,
  },
  codeWrap: {
    borderRadius: 8,
    padding: 10,
  },
});
