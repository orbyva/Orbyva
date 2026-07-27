import { describe, expect, it } from "vitest";
import {
  isExpectedAuthNoise,
  isInAppBrowserBridgeNoise,
} from "@/lib/sentry";

describe("isInAppBrowserBridgeNoise", () => {
  it("filtra bridge do Instagram/WebKit", () => {
    expect(
      isInAppBrowserBridgeNoise({
        exception: {
          values: [
            {
              type: "TypeError",
              value:
                "undefined is not an object (evaluating 'window.webkit.messageHandlers')",
              stacktrace: {
                frames: [{ function: "sendDataToNative" }],
              },
            },
          ],
        },
      })
    ).toBe(true);
  });

  it("não filtra erro real do app", () => {
    expect(
      isInAppBrowserBridgeNoise({
        exception: {
          values: [
            {
              type: "TypeError",
              value: "Cannot read properties of undefined (reading 'map')",
              stacktrace: {
                frames: [{ function: "Goals" }],
              },
            },
          ],
        },
      })
    ).toBe(false);
  });
});

describe("isExpectedAuthNoise", () => {
  it("filtra usuário não autenticado", () => {
    expect(
      isExpectedAuthNoise({
        exception: {
          values: [
            {
              type: "Error",
              value: "Usuário não autenticado.",
            },
          ],
        },
      })
    ).toBe(true);
  });
});
