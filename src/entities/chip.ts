import { Container, Graphics, Text, TextStyle } from "pixi.js";
import { CHIP_COLORS, CHIP_RADIUS } from "../utils/constants";

export const createChip = (value: number, isInteractive = false): Container => {
  const container = new Container();
  container.label = `chip-${value}`;

  const color = CHIP_COLORS[value] ?? 0x888888;

  const circle = new Graphics();
  circle.circle(0, 0, CHIP_RADIUS);
  circle.fill(color);
  circle.stroke({ color: 0xffffff, width: 3 });

  // Inner ring
  const innerRing = new Graphics();
  innerRing.circle(0, 0, CHIP_RADIUS - 6);
  innerRing.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });

  // Dollar value label
  const labelStyle = new TextStyle({
    fontSize: value >= 100 ? 11 : 13,
    fontWeight: "bold",
    fill: "#ffffff",
  });
  const label = new Text({ text: `$${value}`, style: labelStyle });
  label.anchor.set(0.5);

  container.addChild(circle, innerRing, label);

  if (isInteractive) {
    container.eventMode = "static";
    container.cursor = "pointer";
    container.on("pointerover", () => {
      circle.alpha = 0.8;
    });
    container.on("pointerout", () => {
      circle.alpha = 1;
    });
    container.on("pointerdown", () => {
      container.scale.set(0.92);
    });
    container.on("pointerup", () => {
      container.scale.set(1);
    });
    container.on("pointerupoutside", () => {
      container.scale.set(1);
    });
  }

  return container;
};
