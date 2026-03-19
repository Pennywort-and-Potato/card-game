import type { CardData, PokerHandRank, Rank } from "../types";
import { createDeck, shuffleDeck } from "./blackjack-logic";

export { createDeck, shuffleDeck };

const RANK_VALUE: Record<Rank, number> = {
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

const getCombinations = <T>(arr: T[], k: number): T[][] => {
  if (k === 0) return [[]];
  if (arr.length < k) return [];
  const [head, ...tail] = arr;
  return [
    ...getCombinations(tail, k - 1).map((c) => [head, ...c]),
    ...getCombinations(tail, k),
  ];
};

const evaluate5Cards = (cards: CardData[]): PokerHandRank => {
  const vals = cards.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const isFlush = suits.every((s) => s === suits[0]);

  const isNormalStraight = new Set(vals).size === 5 && vals[0] - vals[4] === 4;
  const isWheelStraight =
    vals[0] === 14 &&
    vals[1] === 5 &&
    vals[2] === 4 &&
    vals[3] === 3 &&
    vals[4] === 2;
  const isStraight = isNormalStraight || isWheelStraight;
  const straightHigh = isWheelStraight ? 5 : vals[0];

  const counts = new Map<number, number>();
  for (const v of vals) counts.set(v, (counts.get(v) ?? 0) + 1);
  const groups = [...counts.entries()].sort(
    (a, b) => b[1] - a[1] || b[0] - a[0],
  );
  const tiebreakers = groups.map((g) => g[0]);

  if (isFlush && isStraight) {
    if (straightHigh === 14)
      return { rank: 9, label: "Royal Flush", tiebreakers: [14] };
    return {
      rank: 8,
      label: "Straight Flush",
      tiebreakers: [straightHigh],
    };
  }
  if (groups[0][1] === 4)
    return { rank: 7, label: "Four of a Kind", tiebreakers };
  if (groups[0][1] === 3 && groups[1]?.[1] === 2)
    return { rank: 6, label: "Full House", tiebreakers };
  if (isFlush) return { rank: 5, label: "Flush", tiebreakers: vals };
  if (isStraight)
    return { rank: 4, label: "Straight", tiebreakers: [straightHigh] };
  if (groups[0][1] === 3)
    return { rank: 3, label: "Three of a Kind", tiebreakers };
  if (groups[0][1] === 2 && groups[1]?.[1] === 2)
    return { rank: 2, label: "Two Pair", tiebreakers };
  if (groups[0][1] === 2) return { rank: 1, label: "One Pair", tiebreakers };
  return { rank: 0, label: "High Card", tiebreakers: vals };
};

export const evaluateBestHand = (
  holeCards: CardData[],
  communityCards: CardData[],
): PokerHandRank => {
  const available = [...holeCards, ...communityCards].filter((c) => c.isFaceUp);
  if (available.length < 5) {
    const vals = available.map((c) => RANK_VALUE[c.rank]).sort((a, b) => b - a);
    return { rank: 0, label: "High Card", tiebreakers: vals };
  }
  const combos = getCombinations(available, 5);
  return combos.reduce((best, combo) => {
    const h = evaluate5Cards(combo);
    if (h.rank > best.rank) return h;
    if (h.rank === best.rank) {
      for (let i = 0; i < h.tiebreakers.length; i++) {
        if ((h.tiebreakers[i] ?? 0) > (best.tiebreakers[i] ?? 0)) return h;
        if ((h.tiebreakers[i] ?? 0) < (best.tiebreakers[i] ?? 0)) return best;
      }
    }
    return best;
  }, evaluate5Cards(combos[0]));
};

export const comparePokerHands = (
  h1: PokerHandRank,
  h2: PokerHandRank,
): "h1" | "h2" | "tie" => {
  if (h1.rank > h2.rank) return "h1";
  if (h2.rank > h1.rank) return "h2";
  for (
    let i = 0;
    i < Math.max(h1.tiebreakers.length, h2.tiebreakers.length);
    i++
  ) {
    const v1 = h1.tiebreakers[i] ?? 0;
    const v2 = h2.tiebreakers[i] ?? 0;
    if (v1 > v2) return "h1";
    if (v2 > v1) return "h2";
  }
  return "tie";
};

// Normalized 0–1 hand strength for AI use
export const handStrength = (
  holeCards: CardData[],
  communityCards: CardData[],
): number => evaluateBestHand(holeCards, communityCards).rank / 9;
