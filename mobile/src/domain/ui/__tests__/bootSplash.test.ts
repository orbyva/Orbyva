import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { Colors } from "@/constants/theme";
import { bootSplashBackground, SPLASH_LOGO_SIZE } from "@/domain/ui/bootSplash";

const MOBILE = path.resolve(__dirname, "../../../..");
const appJson = JSON.parse(fs.readFileSync(path.join(MOBILE, "app.json"), "utf8"));

type SplashConfig = {
  backgroundColor: string;
  image: string;
  imageWidth: number;
  dark: { backgroundColor: string; image: string };
};

const splash = (appJson.expo.plugins as unknown[]).find(
  (plugin): plugin is [string, SplashConfig] =>
    Array.isArray(plugin) && plugin[0] === "expo-splash-screen"
)?.[1];

describe("bootSplashBackground", () => {
  it("segue o tema escolhido no app", () => {
    expect(bootSplashBackground("light")).toBe(Colors.light.background);
    expect(bootSplashBackground("dark")).toBe(Colors.dark.background);
  });
});

describe("splash nativo do app.json", () => {
  it("existe", () => {
    expect(splash).toBeDefined();
  });

  it("usa o fundo do tema claro e do escuro", () => {
    expect(splash!.backgroundColor).toBe(Colors.light.background);
    expect(splash!.dark.backgroundColor).toBe(Colors.dark.background);
  });

  it("usa o mark do favicon, com o mesmo tamanho do splash em JS", () => {
    expect(splash!.image).toBe("./assets/images/splash-icon.png");
    expect(splash!.dark.image).toBe(splash!.image);
    expect(splash!.imageWidth).toBe(SPLASH_LOGO_SIZE);
  });

  it("a imagem é quadrada e transparente (PNG RGBA)", () => {
    const png = fs.readFileSync(path.join(MOBILE, splash!.image));
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const colorType = png[25];
    expect(width).toBe(height);
    expect(colorType).toBe(6);
  });
});
