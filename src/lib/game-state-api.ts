import { supabase } from "./supabase";
import type { CardData, GameResult } from "../types";
import type { BigTwoCombo } from "../systems/big-two-logic";

// ── Blackjack MP state ───────────────────────────────────────────────────────
export interface BjMpPlayer {
  name: string;
  hand: CardData[];
  bet: number;
  balance: number;
  status: "betting" | "playing" | "stand" | "bust" | "blackjack" | "done";
  result: GameResult | null;
}

export interface BlackjackMpState {
  phase: "betting" | "player-turns" | "dealer-turn" | "round-over";
  deck: CardData[];
  dealer_hand: CardData[];
  players: BjMpPlayer[];
  active_player: string | null;
}

// ── Poker MP state ───────────────────────────────────────────────────────────
export interface PokerMpPlayer {
  name: string;
  hand: CardData[];
  balance: number;
  bet_this_round: number;
  folded: boolean;
  acted: boolean;
}

export interface PokerMpState {
  phase: "pre-flop" | "flop" | "turn" | "river" | "showdown" | "round-over";
  deck: CardData[];
  community: CardData[];
  pot: number;
  current_bet: number;
  dealer_index: number;
  players: PokerMpPlayer[];
  active_player: string | null;
}

// ── Big Two MP state ────────────────────────────────────────────────────────
export interface BigTwoMpPlayer {
  name: string;
  hand: CardData[];
  finished: boolean;
  finish_rank: number | null;
}

export interface BigTwoMpState {
  phase: "lobby" | "playing" | "game-over";
  players: BigTwoMpPlayer[];
  ready_players: string[];
  current_player: string;
  last_combo: BigTwoCombo | null;
  last_played_by: string | null;
  passed: string[];
  is_first_move: boolean;
  finish_order: string[];
}

export type AnyMpState = BlackjackMpState | PokerMpState | BigTwoMpState;

export interface PlayerAction {
  id: string;
  room_id: string;
  player_name: string;
  action_type: string;
  payload: Record<string, unknown>;
  processed: boolean;
  created_at: string;
}

// ── API ──────────────────────────────────────────────────────────────────────

export const pushGameState = async (
  roomId: string,
  state: AnyMpState,
): Promise<void> => {
  const { error } = await supabase
    .from("game_states")
    .upsert([
      { room_id: roomId, state, updated_at: new Date().toISOString() },
    ] as never);
  if (error) throw error;
};

export const fetchGameState = async <T extends AnyMpState>(
  roomId: string,
): Promise<T | null> => {
  const { data, error } = await supabase
    .from("game_states")
    .select("state")
    .eq("room_id", roomId)
    .maybeSingle();
  if (error || !data) return null;
  return (data as { state: T }).state;
};

export const subscribeToGameState = <T extends AnyMpState>(
  roomId: string,
  onUpdate: (state: T) => void,
): (() => void) => {
  const channel = supabase
    .channel(`gs:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "game_states",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        const row = payload.new as { state: T } | undefined;
        if (row?.state) onUpdate(row.state);
      },
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
};

export const submitAction = async (
  roomId: string,
  playerName: string,
  actionType: string,
  payload: Record<string, unknown> = {},
): Promise<void> => {
  const { error } = await supabase.from("player_actions").insert([
    {
      room_id: roomId,
      player_name: playerName,
      action_type: actionType,
      payload,
    },
  ] as never);
  if (error) throw error;
};

export const subscribeToActions = (
  roomId: string,
  onAction: (action: PlayerAction) => void,
): (() => void) => {
  const channel = supabase
    .channel(`pa:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "player_actions",
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => onAction(payload.new as PlayerAction),
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
};
