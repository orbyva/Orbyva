import { Linking } from "react-native";

export function openExternalUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return;
  const href = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  void Linking.openURL(href);
}
