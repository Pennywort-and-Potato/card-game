import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { CardData } from "../types";

const cardDataMap = new WeakMap<Container, CardData>();
import {
  CARD_CORNER_RADIUS,
  CARD_HEIGHT,
  CARD_WIDTH,
  RED_SUITS,
  SUIT_SYMBOLS,
} from "../utils/constants";

// Card container: children[0] = back, children[1] = front
export const createCard = (data: CardData): Container => {
  const container = new Container();
  container.label = `card-${data.rank}-${data.suit}`;

  const back = buildCardBack();
  const front = buildCardFront(data);

  back.visible = !data.isFaceUp;
  front.visible = data.isFaceUp;

  container.addChild(back, front);
  cardDataMap.set(container, data);

  return container;
};

export const flipCard = (container: Container, isFaceUp: boolean): void => {
  container.children[0].visible = !isFaceUp;
  container.children[1].visible = isFaceUp;
  const data = cardDataMap.get(container);
  if (data) data.isFaceUp = isFaceUp;
};

export const getCardData = (container: Container): CardData => {
  const data = cardDataMap.get(container);
  if (!data) throw new Error("No card data found for container");
  return data;
};

const buildCardBack = (): Graphics => {
  const gfx = new Graphics();

  gfx.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
  gfx.fill(0x1a3a7c);
  gfx.stroke({ color: 0x000000, width: 1 });

  // Simple crosshatch pattern on back
  for (let i = 8; i < CARD_WIDTH; i += 10) {
    gfx.moveTo(i, 2);
    gfx.lineTo(i, CARD_HEIGHT - 2);
  }
  gfx.stroke({ color: 0x2855a8, width: 1 });

  for (let i = 8; i < CARD_HEIGHT; i += 10) {
    gfx.moveTo(2, i);
    gfx.lineTo(CARD_WIDTH - 2, i);
  }
  gfx.stroke({ color: 0x2855a8, width: 1 });

  return gfx;
};

const buildCardFront = (data: CardData): Container => {
  const container = new Container();
  const isRed = RED_SUITS.has(data.suit);
  const suitColor = isRed ? "#cc1111" : "#111111";
  const symbol = SUIT_SYMBOLS[data.suit];

  // Card background
  const bg = new Graphics();
  bg.roundRect(0, 0, CARD_WIDTH, CARD_HEIGHT, CARD_CORNER_RADIUS);
  bg.fill(0xffffff);
  bg.stroke({ color: 0xbbbbbb, width: 1 });
  container.addChild(bg);

  // Top-left rank
  const rankStyle = new TextStyle({
    fontSize: 14,
    fontWeight: "bold",
    fill: suitColor,
  });
  const rankTop = new Text({ text: data.rank, style: rankStyle });
  rankTop.position.set(5, 3);
  container.addChild(rankTop);

  // Top-left suit
  const smallSuitStyle = new TextStyle({ fontSize: 13, fill: suitColor });
  const suitTop = new Text({ text: symbol, style: smallSuitStyle });
  suitTop.position.set(5, 19);
  container.addChild(suitTop);

  // Center suit symbol
  const bigSuitStyle = new TextStyle({ fontSize: 32, fill: suitColor });
  const suitCenter = new Text({ text: symbol, style: bigSuitStyle });
  suitCenter.anchor.set(0.5);
  suitCenter.position.set(CARD_WIDTH / 2, CARD_HEIGHT / 2);
  container.addChild(suitCenter);

  // Bottom-right rank (anchor bottom-right)
  const rankBottom = new Text({ text: data.rank, style: rankStyle });
  rankBottom.anchor.set(1, 1);
  rankBottom.position.set(CARD_WIDTH - 5, CARD_HEIGHT - 5);
  container.addChild(rankBottom);

  // Bottom-right suit
  const suitBottom = new Text({ text: symbol, style: smallSuitStyle });
  suitBottom.anchor.set(1, 1);
  suitBottom.position.set(CARD_WIDTH - 5, CARD_HEIGHT - 21);
  container.addChild(suitBottom);

  return container;
};
