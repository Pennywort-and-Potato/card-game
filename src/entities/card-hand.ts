import { Container } from "pixi.js";
import type { CardData } from "../types";
import { CARD_GAP, CARD_WIDTH, SCREEN_WIDTH } from "../utils/constants";
import { createCard, flipCard, getCardData } from "./card";

export const createCardHand = (label: string): Container => {
  const container = new Container();
  container.label = label;
  return container;
};

export const addCardToHand = (hand: Container, data: CardData): Container => {
  const card = createCard(data);
  const index = hand.children.length;
  card.position.set(index * (CARD_WIDTH + CARD_GAP), 0);
  hand.addChild(card);
  return card;
};

// Re-center the hand container horizontally on screen after adding cards
export const centerHand = (hand: Container, y: number): void => {
  const count = hand.children.length;
  const totalWidth = count * CARD_WIDTH + Math.max(0, count - 1) * CARD_GAP;
  hand.position.set(SCREEN_WIDTH / 2 - totalWidth / 2, y);
};

export const clearHand = (hand: Container): void => {
  hand.removeChildren();
};

export const flipCardAtIndex = (
  hand: Container,
  index: number,
  isFaceUp: boolean,
): void => {
  const card = hand.children[index] as Container | undefined;
  if (card) flipCard(card, isFaceUp);
};

export const getHandCards = (hand: Container): CardData[] => {
  return hand.children.map((c) => getCardData(c as Container));
};
