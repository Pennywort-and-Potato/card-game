export type RoomGameMode = "blackjack" | "poker" | "bigtwo";
export type RoomStatus = "waiting" | "playing" | "finished";
export type GameResult = "player-win" | "dealer-win" | "push" | "blackjack";

export interface Database {
  public: {
    Tables: {
      players: {
        Row: {
          id: string;
          user_id: string;
          display_name: string;
          avatar: string;
          balance: number;
        };
        Insert: {
          id?: string;
          user_id: string;
          display_name: string;
          avatar?: string;
          balance?: number;
        };
        Update: Partial<Database["public"]["Tables"]["players"]["Insert"]>;
      };
      rooms: {
        Row: {
          id: string;
          type: RoomGameMode;
          max_player: number;
          room_code: string;
          is_public: boolean;
          status: RoomStatus;
          created_at: string;
        };
        Insert: {
          id?: string;
          type: RoomGameMode;
          max_player?: number;
          room_code: string;
          is_public?: boolean;
          status?: RoomStatus;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rooms"]["Insert"]>;
      };
      room_players: {
        Row: {
          id: string;
          room_id: string;
          player_id: string;
          is_room_owner: boolean;
          seat_index: number;
          joined_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          player_id: string;
          is_room_owner?: boolean;
          seat_index: number;
          joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["room_players"]["Insert"]>;
      };
      room_states: {
        Row: {
          id: string;
          room_id: string;
          state: Record<string, unknown>;
        };
        Insert: {
          id?: string;
          room_id: string;
          state: Record<string, unknown>;
        };
        Update: Partial<Database["public"]["Tables"]["room_states"]["Insert"]>;
      };
      player_actions: {
        Row: {
          id: string;
          room_id: string;
          player_id: string;
          action_type: string;
          payload: Record<string, unknown>;
          processed: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          player_id: string;
          action_type: string;
          payload?: Record<string, unknown>;
          processed?: boolean;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["player_actions"]["Insert"]>;
      };
      match_results: {
        Row: {
          id: string;
          room_id: string;
          winner_id: string;
          issued_at: string;
        };
        Insert: {
          id?: string;
          room_id: string;
          winner_id: string;
          issued_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["match_results"]["Insert"]>;
      };
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
        Update: Partial<Database["public"]["Tables"]["round_results"]["Insert"]>;
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
