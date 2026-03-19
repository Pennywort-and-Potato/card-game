import type { CardData, GameResult, HandValue, Rank, Suit } from "../types";

const SUITS: Suit[] = ["hearts", "diamonds", "clubs", "spades"];
const RANKS: Rank[] = [
  "A",
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
];

const RANK_VALUES: Record<Rank, number> = {
  A: 11,
  "2": 2,
  "3": 3,
  "4": 4,
  "5": 5,
  "6": 6,
  "7": 7,
  "8": 8,
  "9": 9,
  "10": 10,
  J: 10,
  Q: 10,
  K: 10,
};

export const createDeck = (): CardData[] => {
  const deck: CardData[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ suit, rank, isFaceUp: false });
    }
  }
  return deck;
};

export const shuffleDeck = (deck: CardData[]): CardData[] => {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const calculateHandValue = (cards: CardData[]): HandValue => {
  const faceUpCards = cards.filter((c) => c.isFaceUp);
  let value = 0;
  let aces = 0;

  for (const card of faceUpCards) {
    value += RANK_VALUES[card.rank];
    if (card.rank === "A") aces++;
  }

  while (value > 21 && aces > 0) {
    value -= 10;
    aces--;
  }

  return {
    value,
    isSoft: aces > 0 && value <= 21,
    isBust: value > 21,
    isBlackjack: faceUpCards.length === 2 && value === 21,
  };
};

export const shouldDealerHit = (cards: CardData[]): boolean => {
  return calculateHandValue(cards).value < 17;
};

export const determineWinner = (
  playerCards: CardData[],
  dealerCards: CardData[],
): GameResult => {
  const player = calculateHandValue(playerCards);
  const dealer = calculateHandValue(dealerCards);

  if (player.isBlackjack && !dealer.isBlackjack) return "blackjack";
  if (player.isBust) return "dealer-win";
  if (dealer.isBust) return "player-win";
  if (player.value > dealer.value) return "player-win";
  if (dealer.value > player.value) return "dealer-win";
  return "push";
};
