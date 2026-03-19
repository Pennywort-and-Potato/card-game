import { Container, Graphics, Text, TextStyle } from "pixi.js";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  TABLE_BORDER_COLOR,
  TABLE_FELT_COLOR,
  TABLE_INNER_COLOR,
} from "./constants";

export const createTableBackground = (): Graphics => {
  const gfx = new Graphics();

  // Main felt background
  gfx.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT);
  gfx.fill(TABLE_FELT_COLOR);

  // Inner oval area
  gfx.ellipse(
    SCREEN_WIDTH / 2,
    SCREEN_HEIGHT / 2,
    SCREEN_WIDTH * 0.44,
    SCREEN_HEIGHT * 0.41,
  );
  gfx.fill(TABLE_INNER_COLOR);

  // Gold border
  gfx.ellipse(
    SCREEN_WIDTH / 2,
    SCREEN_HEIGHT / 2,
    SCREEN_WIDTH * 0.445,
    SCREEN_HEIGHT * 0.415,
  );
  gfx.stroke({ color: TABLE_BORDER_COLOR, width: 3, alpha: 0.7 });

  return gfx;
};

export const createButton = (
  label: string,
  width = 120,
  height = 44,
  color = 0x1e1e38,
): Container => {
  const container = new Container();

  const bg = new Graphics();
  bg.roundRect(0, 0, width, height, 8);
  bg.fill(color);

  const style = new TextStyle({
    fontSize: 15,
    fontWeight: "bold",
    fill: "#ffffff",
  });
  const text = new Text({ text: label, style });
  text.anchor.set(0.5);
  text.position.set(width / 2, height / 2);

  container.addChild(bg, text);
  container.eventMode = "static";
  container.cursor = "pointer";

  container.on("pointerover", () => {
    bg.tint = 0xdddddd;
  });
  container.on("pointerout", () => {
    bg.tint = 0xffffff;
  });
  container.on("pointerdown", () => {
    container.alpha = 0.8;
  });
  container.on("pointerup", () => {
    container.alpha = 1;
  });
  container.on("pointerupoutside", () => {
    container.alpha = 1;
  });

  return container;
};

export const setButtonEnabled = (button: Container, enabled: boolean): void => {
  button.eventMode = enabled ? "static" : "none";
  button.alpha = enabled ? 1 : 0.4;
  button.cursor = enabled ? "pointer" : "default";
};
