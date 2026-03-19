export const SCREEN_WIDTH = 1280;
export const SCREEN_HEIGHT = 720;

export const CARD_WIDTH = 80;
export const CARD_HEIGHT = 112;
export const CARD_GAP = 18;
export const CARD_CORNER_RADIUS = 6;

export const STARTING_BALANCE = 1000;
export const MIN_BET = 10;
export const CHIP_VALUES = [10, 25, 50, 100, 500] as const;

export const CHIP_RADIUS = 26;

export const CHIP_COLORS: Record<number, number> = {
  10: 0x3498db,
  25: 0x2ecc71,
  50: 0xe74c3c,
  100: 0x9b59b6,
  500: 0xf39c12,
};

export const TABLE_FELT_COLOR = 0x0b2818;
export const TABLE_INNER_COLOR = 0x0f3320;
export const TABLE_BORDER_COLOR = 0xd4af37;

export const DEALER_HAND_Y = 110;
export const PLAYER_HAND_Y = 440;

export const SUIT_SYMBOLS: Record<string, string> = {
  hearts: "♥",
  diamonds: "♦",
  clubs: "♣",
  spades: "♠",
};

export const RED_SUITS = new Set(["hearts", "diamonds"]);

export const DEAL_DELAY_MS = 280;
export const DEALER_DRAW_DELAY_MS = 700;

// ---- Poker layout ----
export const POKER_COMMUNITY_Y = 265;
export const POKER_DEALER_LABEL_Y = 92;
export const POKER_PLAYER_LABEL_Y = 422;

// ---- Poker betting ----
export const POKER_ANTE = 10;
export const POKER_RAISE_AMOUNT = 50;

// ---- Poker timing ----
export const POKER_DEAL_DELAY_MS = 200;
export const POKER_AI_THINK_MS = 1100;
export const POKER_STREET_PAUSE_MS = 500;
