import { vi } from "vitest";

vi.mock("react-native", () => ({
  Platform: { OS: "ios", select: (spec: Record<string, unknown>) => spec.ios },
  AppState: { addEventListener: () => ({ remove: () => undefined }) },
  StyleSheet: { create: (s: unknown) => s },
  View: "View",
  Text: "Text",
  Pressable: "Pressable",
  ScrollView: "ScrollView",
  TextInput: "TextInput",
  FlatList: "FlatList",
  ActivityIndicator: "ActivityIndicator",
  Alert: { alert: vi.fn() },
}));

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: {
        EXPO_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
        EXPO_PUBLIC_SUPABASE_ANON_KEY: "test-anon-key",
      },
    },
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({ data: { session: null } }),
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
    },
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => ({ data: null, error: null }) }) }),
      update: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      delete: () => ({ eq: () => ({ eq: async () => ({ error: null }) }) }),
      select: () => ({ eq: () => ({ single: async () => ({ data: null, error: null }) }) }),
    }),
  },
  AUTH_STORAGE_KEY: "test",
}));

vi.mock("@/lib/auth-user", () => ({
  getCurrentUserId: async () => "user-1",
}));
