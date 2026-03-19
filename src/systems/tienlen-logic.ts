import type { CardData, Rank, Suit } from "../types";

// Tien Len ranking: 3 is lowest, 2 is highest
export const TL_RANK_ORDER: Rank[] = [
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
  "2",
];
export const TL_SUIT_ORDER: Suit[] = ["spades", "clubs", "diamonds", "hearts"];

export type TienLenComboType =
  | "single"
  | "pair"
  | "triple"
  | "quad"
  | "straight"
  | "double-sequence";

export interface TienLenCombo {
  type: TienLenComboType;
  cards: CardData[];
  highCardValue: number; // for comparison
  length: number;
}

// Returns 0 (3♠ lowest) to 51 (2♥ highest)
export function getCardValue(card: CardData): number {
  return (
    TL_RANK_ORDER.indexOf(card.rank) * 4 + TL_SUIT_ORDER.indexOf(card.suit)
  );
}

export function getRankIndex(rank: Rank): number {
  return TL_RANK_ORDER.indexOf(rank);
}

export function sortHand(hand: CardData[]): CardData[] {
  return [...hand].sort((a, b) => getCardValue(a) - getCardValue(b));
}

// ─── Combination Detection ───────────────────────────────────────────────────

export function detectCombo(cards: CardData[]): TienLenCombo | null {
  if (cards.length === 0) return null;
  const sorted = [...cards].sort((a, b) => getCardValue(a) - getCardValue(b));
  const n = cards.length;

  if (n === 1) {
    return {
      type: "single",
      cards: sorted,
      highCardValue: getCardValue(sorted[0]),
      length: 1,
    };
  }

  if (n === 2) {
    if (sorted[0].rank === sorted[1].rank) {
      return {
        type: "pair",
        cards: sorted,
        highCardValue: getCardValue(sorted[1]),
        length: 2,
      };
    }
    return null;
  }

  if (n === 3) {
    if (
      sorted[0].rank === sorted[1].rank &&
      sorted[1].rank === sorted[2].rank
    ) {
      return {
        type: "triple",
        cards: sorted,
        highCardValue: getCardValue(sorted[2]),
        length: 3,
      };
    }
    return detectStraight(sorted);
  }

  if (n === 4) {
    if (
      sorted[0].rank === sorted[1].rank &&
      sorted[1].rank === sorted[2].rank &&
      sorted[2].rank === sorted[3].rank
    ) {
      return {
        type: "quad",
        cards: sorted,
        highCardValue: getCardValue(sorted[3]),
        length: 4,
      };
    }
    return detectStraight(sorted);
  }

  // 5+ cards
  if (n % 2 === 0) {
    const ds = detectDoubleSequence(sorted);
    if (ds) return ds;
  }
  return detectStraight(sorted);
}

function detectStraight(sorted: CardData[]): TienLenCombo | null {
  const n = sorted.length;
  if (n < 3) return null;
  if (sorted.some((c) => c.rank === "2")) return null;

  const rankIndices = sorted.map((c) => getRankIndex(c.rank));
  // All ranks must be unique and consecutive
  if (new Set(rankIndices).size !== n) return null;
  const ri = [...rankIndices].sort((a, b) => a - b);
  for (let i = 1; i < ri.length; i++) {
    if (ri[i] !== ri[i - 1] + 1) return null;
  }

  return {
    type: "straight",
    cards: sorted,
    highCardValue: getCardValue(sorted[sorted.length - 1]),
    length: n,
  };
}

function detectDoubleSequence(sorted: CardData[]): TienLenCombo | null {
  const n = sorted.length;
  if (n < 6 || n % 2 !== 0) return null;
  if (sorted.some((c) => c.rank === "2")) return null;

  const byRank = new Map<string, CardData[]>();
  for (const card of sorted) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank)!.push(card);
  }

  const pairs = n / 2;
  if (byRank.size !== pairs) return null;
  for (const [, cs] of byRank) {
    if (cs.length !== 2) return null;
  }

  const rankIndices = [...byRank.keys()].map((r) => getRankIndex(r as Rank));
  const ri = [...rankIndices].sort((a, b) => a - b);
  for (let i = 1; i < ri.length; i++) {
    if (ri[i] !== ri[i - 1] + 1) return null;
  }

  return {
    type: "double-sequence",
    cards: sorted,
    highCardValue: getCardValue(sorted[sorted.length - 1]),
    length: n,
  };
}

// ─── Beating Rules ───────────────────────────────────────────────────────────

export function canBeat(play: TienLenCombo, current: TienLenCombo): boolean {
  // Beating a single 2
  if (current.type === "single" && current.cards[0].rank === "2") {
    if (play.type === "quad") return true;
    if (play.type === "double-sequence" && play.length >= 6) return true; // 3+ pairs
    if (play.type === "single" && play.cards[0].rank === "2") {
      return play.highCardValue > current.highCardValue;
    }
    return false;
  }

  // Beating a quad
  if (current.type === "quad") {
    if (play.type === "double-sequence" && play.length >= 8) return true; // 4+ pairs
    if (play.type === "quad") return play.highCardValue > current.highCardValue;
    return false;
  }

  // Standard: same type, same length, higher highCardValue
  if (play.type !== current.type) return false;
  if (play.length !== current.length) return false;
  return play.highCardValue > current.highCardValue;
}

// ─── Finding Plays ───────────────────────────────────────────────────────────

export function findBeatingPlays(
  hand: CardData[],
  current: TienLenCombo | null,
): TienLenCombo[] {
  const all = findAllCombos(hand);
  if (current === null) return all;
  return all
    .filter((c) => canBeat(c, current))
    .sort((a, b) => a.highCardValue - b.highCardValue);
}

export function findAllCombos(hand: CardData[]): TienLenCombo[] {
  const results: TienLenCombo[] = [];

  // Singles
  for (const card of hand) {
    results.push({
      type: "single",
      cards: [card],
      highCardValue: getCardValue(card),
      length: 1,
    });
  }

  // Pairs, triples, quads grouped by rank
  const byRank = new Map<string, CardData[]>();
  for (const card of hand) {
    if (!byRank.has(card.rank)) byRank.set(card.rank, []);
    byRank.get(card.rank)!.push(card);
  }
  for (const [, cs] of byRank) {
    const s = [...cs].sort((a, b) => getCardValue(a) - getCardValue(b));
    if (s.length >= 2) {
      results.push({
        type: "pair",
        cards: s.slice(0, 2),
        highCardValue: getCardValue(s[1]),
        length: 2,
      });
      if (s.length >= 3) {
        results.push({
          type: "triple",
          cards: s.slice(0, 3),
          highCardValue: getCardValue(s[2]),
          length: 3,
        });
        if (s.length === 4) {
          results.push({
            type: "quad",
            cards: s,
            highCardValue: getCardValue(s[3]),
            length: 4,
          });
        }
      }
    }
  }

  // Build rank index → cards map (no 2s)
  const rankMap = new Map<number, CardData[]>();
  for (const card of hand) {
    if (card.rank === "2") continue;
    const ri = getRankIndex(card.rank);
    if (!rankMap.has(ri)) rankMap.set(ri, []);
    rankMap.get(ri)!.push(card);
  }
  const sortedRIs = [...rankMap.keys()].sort((a, b) => a - b);

  // Straights
  for (let start = 0; start < sortedRIs.length; start++) {
    let runCards: CardData[] = [];
    let prev = sortedRIs[start] - 1;

    for (let end = start; end < sortedRIs.length; end++) {
      if (sortedRIs[end] !== prev + 1) break;
      prev = sortedRIs[end];
      const cs = [...(rankMap.get(sortedRIs[end]) ?? [])].sort(
        (a, b) => getCardValue(a) - getCardValue(b),
      );
      runCards = [...runCards, cs[0]];

      if (runCards.length >= 3) {
        const sorted = [...runCards].sort(
          (a, b) => getCardValue(a) - getCardValue(b),
        );
        results.push({
          type: "straight",
          cards: sorted,
          highCardValue: getCardValue(sorted[sorted.length - 1]),
          length: sorted.length,
        });
      }
    }
  }

  // Double sequences (each rank needs 2+ cards)
  for (let start = 0; start < sortedRIs.length; start++) {
    if ((rankMap.get(sortedRIs[start]) ?? []).length < 2) continue;
    let runCards: CardData[] = [];
    let prev = sortedRIs[start] - 1;

    for (let end = start; end < sortedRIs.length; end++) {
      if (sortedRIs[end] !== prev + 1) break;
      const cs = rankMap.get(sortedRIs[end]) ?? [];
      if (cs.length < 2) break;
      prev = sortedRIs[end];
      const s2 = [...cs].sort((a, b) => getCardValue(a) - getCardValue(b));
      runCards = [...runCards, s2[0], s2[1]];

      if (runCards.length >= 6) {
        const sorted = [...runCards].sort(
          (a, b) => getCardValue(a) - getCardValue(b),
        );
        results.push({
          type: "double-sequence",
          cards: sorted,
          highCardValue: getCardValue(sorted[sorted.length - 1]),
          length: sorted.length,
        });
      }
    }
  }

  return results;
}

// ─── AI ──────────────────────────────────────────────────────────────────────

export function aiPickPlay(
  hand: CardData[],
  current: TienLenCombo | null,
  isFirstMove = false,
): TienLenCombo | null {
  // First move of the game: must play 3♣
  if (isFirstMove && current === null) {
    const threeClubs = hand.find((c) => c.rank === "3" && c.suit === "clubs");
    if (threeClubs) {
      return {
        type: "single",
        cards: [threeClubs],
        highCardValue: getCardValue(threeClubs),
        length: 1,
      };
    }
  }

  if (current === null) {
    // Free turn: play lowest non-2 single card
    const nonTwos = sortHand(hand.filter((c) => c.rank !== "2"));
    const target = nonTwos.length > 0 ? nonTwos[0] : sortHand(hand)[0];
    return {
      type: "single",
      cards: [target],
      highCardValue: getCardValue(target),
      length: 1,
    };
  }

  const beating = findBeatingPlays(hand, current);
  if (beating.length === 0) return null;
  return beating[0];
}

// ─── Deck & Deal ─────────────────────────────────────────────────────────────

export function createTienLenDeck(): CardData[] {
  const ranks: Rank[] = [
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    "10",
    "J",
    "Q",
    "K",
    "A",
  ];
  const suits: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
  const deck: CardData[] = [];
  for (const rank of ranks) {
    for (const suit of suits) {
      deck.push({ rank, suit, isFaceUp: false });
    }
  }
  // Fisher-Yates shuffle
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

export function dealCards(deck: CardData[], numPlayers: number): CardData[][] {
  const hands: CardData[][] = Array.from({ length: numPlayers }, () => []);
  for (let i = 0; i < 13 * numPlayers; i++) {
    hands[i % numPlayers].push({ ...deck[i], isFaceUp: true });
  }
  return hands;
}

export function findThreeOfClubsOwner(hands: CardData[][]): number {
  for (let i = 0; i < hands.length; i++) {
    if (hands[i].some((c) => c.rank === "3" && c.suit === "clubs")) return i;
  }
  return 0;
}

export function isValidFirstPlay(combo: TienLenCombo): boolean {
  return combo.cards.some((c) => c.rank === "3" && c.suit === "clubs");
}

export function comboLabel(combo: TienLenCombo): string {
  const rankStr = combo.cards.map((c) => c.rank).join("-");
  switch (combo.type) {
    case "single":
      return combo.cards[0].rank + suitSymbol(combo.cards[0].suit);
    case "pair":
      return `Pair of ${combo.cards[0].rank}s`;
    case "triple":
      return `Triple ${combo.cards[0].rank}s`;
    case "quad":
      return `Four ${combo.cards[0].rank}s`;
    case "straight":
      return `Straight (${rankStr})`;
    case "double-sequence":
      return `Double Seq (${rankStr})`;
  }
}

function suitSymbol(suit: Suit): string {
  return { hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" }[suit];
}
