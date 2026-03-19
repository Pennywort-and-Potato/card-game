import { supabase } from "./supabase";
import type { GameResult } from "../types";

export interface RoundPayload {
  playerName: string;
  result: GameResult;
  bet: number;
  balanceAfter: number;
}

export interface LeaderboardEntry {
  player_name: string;
  high_score: number;
  rounds_played: number;
}

export const saveRoundResult = async (payload: RoundPayload): Promise<void> => {
  const { error } = await supabase.from("round_results").insert([
    {
      player_name: payload.playerName,
      result: payload.result,
      bet: payload.bet,
      balance_after: payload.balanceAfter,
    },
  ] as never);

  if (error) console.error("[game-api] saveRoundResult:", error.message);
};

export const fetchLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  const { data, error } = await supabase
    .from("leaderboard")
    .select("player_name, high_score, rounds_played")
    .order("high_score", { ascending: false })
    .limit(10);

  if (error) {
    console.error("[game-api] fetchLeaderboard:", error.message);
    return [];
  }

  return (data as LeaderboardEntry[]) ?? [];
};
