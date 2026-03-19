import { Container, Text, TextStyle } from "pixi.js";
import { createChip } from "../entities/chip";
import { createButton, setButtonEnabled } from "../utils/mock-graphics";
import { CHIP_VALUES, SCREEN_HEIGHT, SCREEN_WIDTH } from "../utils/constants";
import type { GameState } from "../types";

export interface UIScene {
  container: Container;
  updateBalance(balance: number): void;
  updateBet(bet: number): void;
  updateMessage(msg: string): void;
  syncState(state: GameState): void;
  onDeal(cb: () => void): void;
  onHit(cb: () => void): void;
  onStand(cb: () => void): void;
  onDouble(cb: () => void): void;
  onNewRound(cb: () => void): void;
  onChipBet(cb: (value: number) => void): void;
  onMenu(cb: () => void): void;
}

export const createUIScene = (): UIScene => {
  const container = new Container();
  container.label = "ui-scene";

  // --- Info panel (top-left) ---
  const infoStyle = new TextStyle({
    fontSize: 18,
    fontWeight: "bold",
    fill: "#f0c040",
  });
  const balanceText = new Text({ text: "Balance: $1000", style: infoStyle });
  balanceText.position.set(20, 18);

  const betStyle = new TextStyle({ fontSize: 16, fill: "#ffffff" });
  const betText = new Text({ text: "Bet: $0", style: betStyle });
  betText.position.set(20, 46);

  // --- Center message ---
  const msgStyle = new TextStyle({
    fontSize: 30,
    fontWeight: "bold",
    fill: "#f0c040",
  });
  const messageText = new Text({ text: "Place your bet!", style: msgStyle });
  messageText.anchor.set(0.5);
  messageText.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2 - 10);

  // --- Chip buttons (bottom-center) ---
  const chipsContainer = new Container();
  chipsContainer.label = "chips";
  const chipSpacing = 62;
  const chipsWidth = CHIP_VALUES.length * chipSpacing - (chipSpacing - 52);
  chipsContainer.position.set(
    SCREEN_WIDTH / 2 - chipsWidth / 2,
    SCREEN_HEIGHT - 72,
  );

  let chipBetCb: ((v: number) => void) | null = null;
  CHIP_VALUES.forEach((value, i) => {
    const chip = createChip(value, true);
    chip.position.set(i * chipSpacing + 26, 0);
    chip.on("pointerdown", () => chipBetCb?.(value));
    chipsContainer.addChild(chip);
  });

  // --- Action buttons (bottom-right) ---
  const BTN_W = 110;
  const BTN_H = 44;
  const BTN_X = SCREEN_WIDTH - BTN_W - 24;
  const BTN_GAP = 54;

  const dealBtn = createButton("Deal", BTN_W, BTN_H, 0x27ae60);
  const hitBtn = createButton("Hit", BTN_W, BTN_H, 0x2980b9);
  const standBtn = createButton("Stand", BTN_W, BTN_H, 0xc0392b);
  const doubleBtn = createButton("Double", BTN_W, BTN_H, 0x8e44ad);
  const newRoundBtn = createButton("New Round", BTN_W + 20, BTN_H, 0x27ae60);
  const menuBtn = createButton("← Menu", 90, 34, 0x444444);

  dealBtn.position.set(BTN_X, SCREEN_HEIGHT - BTN_GAP * 1 - 20);
  hitBtn.position.set(BTN_X, SCREEN_HEIGHT - BTN_GAP * 3 - 20);
  standBtn.position.set(BTN_X, SCREEN_HEIGHT - BTN_GAP * 2 - 20);
  doubleBtn.position.set(BTN_X, SCREEN_HEIGHT - BTN_GAP * 1 - 20);
  newRoundBtn.position.set(
    SCREEN_WIDTH / 2 - (BTN_W + 20) / 2,
    SCREEN_HEIGHT - BTN_GAP * 1 - 20,
  );
  menuBtn.position.set(SCREEN_WIDTH - 110, 14);

  container.addChild(
    balanceText,
    betText,
    messageText,
    chipsContainer,
    dealBtn,
    hitBtn,
    standBtn,
    doubleBtn,
    newRoundBtn,
    menuBtn,
  );

  // --- State sync ---
  const syncState = (state: GameState): void => {
    const isBetting = state === "betting";
    const isPlaying = state === "player-turn";
    const isOver = state === "game-over";
    const isDealing = state === "dealing" || state === "dealer-turn";

    chipsContainer.eventMode = isBetting ? "static" : "none";
    chipsContainer.alpha = isBetting ? 1 : 0.35;

    dealBtn.visible = isBetting;
    setButtonEnabled(dealBtn, isBetting);

    hitBtn.visible = isPlaying;
    standBtn.visible = isPlaying;
    doubleBtn.visible = isPlaying;

    newRoundBtn.visible = isOver;

    if (isDealing) messageText.text = "";
  };

  // Initialize to betting state
  syncState("betting");

  return {
    container,
    updateBalance: (b) => {
      balanceText.text = `Balance: $${b}`;
    },
    updateBet: (b) => {
      betText.text = `Bet: $${b}`;
    },
    updateMessage: (msg) => {
      messageText.text = msg;
    },
    syncState,
    onDeal: (cb) => dealBtn.on("pointerdown", cb),
    onHit: (cb) => hitBtn.on("pointerdown", cb),
    onStand: (cb) => standBtn.on("pointerdown", cb),
    onDouble: (cb) => doubleBtn.on("pointerdown", cb),
    onNewRound: (cb) => newRoundBtn.on("pointerdown", cb),
    onChipBet: (cb) => {
      chipBetCb = cb;
    },
    onMenu: (cb) => menuBtn.on("pointerdown", cb),
  };
};
