import { Image } from "expo-image";

/** O mark real (`logo-mark-sky.png`), o mesmo do canvas web. */
const MARK_ASPECT = 763 / 548;
const MARK_SOURCE = require("../../../assets/images/logo-mark-sky.png");

export function ShareBrandMark({ size = 20 }: { size?: number }) {
  return (
    <Image
      source={MARK_SOURCE}
      style={{ width: size * MARK_ASPECT, height: size }}
      contentFit="contain"
      transition={0}
    />
  );
}
