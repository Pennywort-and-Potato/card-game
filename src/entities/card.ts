import { Assets, Container, Sprite } from "pixi.js";
import type { CardData, Suit } from "../types";
import { CARD_HEIGHT, CARD_WIDTH } from "../utils/constants";

const cardDataMap = new WeakMap<Container, CardData>();

const SUIT_INITIAL: Record<Suit, string> = {
  hearts: "H",
  diamonds: "D",
  clubs: "C",
  spades: "S",
};

const cardTexturePath = (data: CardData): string =>
  `assets/cards/${data.rank}-${SUIT_INITIAL[data.suit]}.png`;

const backTexturePath = (): string => `assets/cards/back-blue.png`;

const makeSprite = (path: string): Sprite => {
  const sprite = Sprite.from(Assets.get(path) ?? path);
  sprite.width = CARD_WIDTH;
  sprite.height = CARD_HEIGHT;
  return sprite;
};

// Card container: children[0] = back, children[1] = front
export const createCard = (data: CardData): Container => {
  const container = new Container();
  container.label = `card-${data.rank}-${data.suit}`;

  const back = makeSprite(backTexturePath());
  const front = makeSprite(cardTexturePath(data));

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
