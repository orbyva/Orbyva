import { ChipBar } from "@/components/ChipBar";
import { ThemedText } from "@/components/themed-text";
import { View } from "react-native";

export function RecommendField({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <View style={{ gap: 8 }}>
      <ThemedText type="small" themeColor="textSecondary">
        Recomendaria?
      </ThemedText>
      <ChipBar
        options={[
          { id: "yes", label: "Sim" },
          { id: "no", label: "Não" },
        ]}
        value={value ? "yes" : "no"}
        onChange={(id) => onChange(id === "yes")}
      />
    </View>
  );
}
