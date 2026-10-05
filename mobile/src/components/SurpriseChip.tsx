import { Chip } from "@/components/ui";

export function SurpriseChip({ onPress }: { onPress: () => void }) {
  return (
    <Chip
      label="Me surpreenda"
      icon="color-wand-outline"
      accessibilityLabel="Me surpreenda"
      selected
      onPress={onPress}
    />
  );
}
