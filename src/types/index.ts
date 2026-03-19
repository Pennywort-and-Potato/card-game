export type Suit = "hearts" | "diamonds" | "clubs" | "spades";
export type Rank =
  | "A"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "J"
  | "Q"
  | "K";

export interface CardData {
  suit: Suit;
  rank: Rank;
  isFaceUp: boolean;
}

export type GameState =
  | "betting"
  | "dealing"
  | "player-turn"
  | "dealer-turn"
  | "game-over";
export type GameResult = "player-win" | "dealer-win" | "push" | "blackjack";

export interface HandValue {
  value: number;
  isSoft: boolean;
  isBust: boolean;
  isBlackjack: boolean;
}

// ---- Poker types ----
export type PokerStreet = "pre-flop" | "flop" | "turn" | "river";

export type PokerGameState =
  | "idle"
  | "dealing"
  | "player-act"
  | "ai-acting"
  | "player-respond"
  | "showdown"
  | "round-over";

export type PokerAction = "fold" | "check" | "call" | "raise";

export interface PokerHandRank {
  rank: number; // 0 (high card) – 9 (royal flush)
  label: string;
  tiebreakers: number[];
}

// ---- Big Two types ----
export type BigTwoGameState = "playing" | "round-reset" | "game-over";

// ---- Scene types ----
export type SceneName =
  | "auth"
  | "menu"
  | "lobby"
  | "blackjack"
  | "poker"
  | "bigtwo";
export type RoomGameMode = "blackjack" | "poker" | "bigtwo";
export type SceneParams = Record<string, unknown>;
