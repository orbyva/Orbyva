import * as Sharing from "expo-sharing";
import { Platform, Share } from "react-native";

export async function shareOpinionPayload(input: {
  title: string;
  message: string;
  fileUri?: string | null;
}): Promise<"shared" | "cancelled"> {
  try {
    if (input.fileUri && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(input.fileUri, {
        mimeType: "image/png",
        dialogTitle: input.title,
        UTI: "public.png",
      });
      return "shared";
    }
    const result = await Share.share({
      title: input.title,
      message: input.message,
      ...(Platform.OS === "ios" && input.fileUri
        ? { url: input.fileUri }
        : {}),
    });
    if (result.action === Share.dismissedAction) return "cancelled";
    return "shared";
  } catch (err) {
    const name = (err as { name?: string }).name;
    if (name === "AbortError") return "cancelled";
    throw err;
  }
}
