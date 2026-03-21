import { Container, Graphics, Text, TextStyle } from "pixi.js";

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
