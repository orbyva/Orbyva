import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ThemedText } from "@/components/themed-text";
import { Radius, Spacing } from "@/constants/theme";
import { useTheme } from "@/hooks/use-theme";
import { hapticError, hapticSuccess } from "@/lib/haptics";

export type ToastTone = "error" | "success";

type ToastState = {
  toast: (message: string, tone?: ToastTone) => void;
};

const ToastContext = createContext<ToastState | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState<{
    message: string;
    tone: ToastTone;
  } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const toast = useCallback((message: string, tone: ToastTone = "error") => {
    if (timer.current) clearTimeout(timer.current);
    setCurrent({ message, tone });
    if (tone === "error") void hapticError();
    else void hapticSuccess();
    timer.current = setTimeout(() => setCurrent(null), 2800);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);
  const bg = current?.tone === "success" ? theme.success : theme.danger;

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current ? (
        <View
          pointerEvents="box-none"
          style={[styles.host, { top: insets.top + 8 }]}
        >
          <Pressable
            onPress={() => setCurrent(null)}
            style={[styles.toast, { backgroundColor: bg }]}
          >
            <ThemedText type="smallBold" style={styles.label}>
              {current.message}
            </ThemedText>
          </Pressable>
        </View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast precisa do ToastProvider.");
  return ctx;
}

export function useFeedback() {
  const { toast } = useToast();
  return {
    fail: (message: string) => toast(message, "error"),
    ok: (message?: string) => {
      if (message) toast(message, "success");
      else void hapticSuccess();
    },
  };
}

const styles = StyleSheet.create({
  host: {
    position: "absolute",
    left: Spacing.three,
    right: Spacing.three,
    zIndex: 200,
  },
  toast: {
    borderRadius: Radius.control,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  label: { color: "#FFFFFF" },
});
