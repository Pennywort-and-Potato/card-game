export type RoomGameMode = "blackjack" | "poker" | "tienlen";
export type RoomStatus = "waiting" | "playing" | "finished";
export type GameResult = "player-win" | "dealer-win" | "push" | "blackjack";

export interface Database {
  public: {
    Tables: {
      round_results: {
        Row: {
          id: string;
          player_name: string;
          result: GameResult;
          bet: number;
          balance_after: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          player_name?: string;
          result: GameResult;
          bet: number;
          balance_after: number;
          created_at?: string;
        };
        Update: Partial<
          Database["public"]["Tables"]["round_results"]["Insert"]
        >;
      };
      poker_rooms: {
        Row: {
          id: string;
          code: string;
          game_mode: RoomGameMode;
          host_name: string;
          host_user_id: string | null;
          max_players: number;
          status: RoomStatus;
          is_private: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          code: string;
          game_mode: RoomGameMode;
          host_name: string;
          host_user_id?: string | null;
          max_players?: number;
          status?: RoomStatus;
          is_private?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["poker_rooms"]["Insert"]>;
      };
      poker_room_players: {
        Row: {
          id: string;
          room_id: string;
          player_name: string;
          user_id: string | null;
          seat_index: number;
          balance: number;
          is_host: boolean;
        };
        Insert: {
          id?: string;
          room_id: string;
          player_name: string;
          user_id?: string | null;
          seat_index: number;
          balance?: number;
          is_host?: boolean;
        };
        Update: Partial<
          Database["public"]["Tables"]["poker_room_players"]["Insert"]
        >;
      };
    };
    Views: {
      leaderboard: {
        Row: {
          player_name: string;
          high_score: number;
          rounds_played: number;
        };
      };
    };
    Functions: Record<string, never>;
    Enums: Record<string, never>;
  };
}
