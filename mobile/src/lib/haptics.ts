import * as Haptics from "expo-haptics";

async function run(fn: () => Promise<void>) {
  try {
    await fn();
  } catch {
    // Sem motor de haptic (simulador / web): segue silencioso.
  }
}

export function hapticLight() {
  return run(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

export function hapticError() {
  return run(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error)
  );
}

export function hapticSuccess() {
  return run(() =>
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success)
  );
}
