import { supabase } from "./supabase";

export type RoomGameMode = "blackjack" | "poker" | "bigtwo";
export type RoomStatus = "waiting" | "playing" | "finished";

export interface Room {
  id: string;
  code: string;
  game_mode: RoomGameMode;
  host_name: string;
  host_user_id: string | null;
  max_players: number;
  status: RoomStatus;
  is_private: boolean;
  created_at: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  player_name: string;
  user_id: string | null;
  seat_index: number;
  balance: number;
  is_host: boolean;
}

export interface RoomWithPlayers extends Room {
  players: RoomPlayer[];
}

const generateCode = (): string =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const maxPlayersForMode = (gameMode: RoomGameMode): number => {
  if (gameMode === "bigtwo") return 4;
  return 6;
};

export const createRoom = async (
  gameMode: RoomGameMode,
  userId: string,
  hostName: string,
  isPrivate = false,
): Promise<RoomWithPlayers> => {
  const code = generateCode();
  const maxPlayers = maxPlayersForMode(gameMode);

  const { data: room, error: roomErr } = await supabase
    .from("poker_rooms")
    .insert([
      {
        code,
        game_mode: gameMode,
        host_name: hostName,
        host_user_id: userId,
        max_players: maxPlayers,
        is_private: isPrivate,
      },
    ] as never)
    .select()
    .single();
  if (roomErr) throw roomErr;

  const { data: player, error: playerErr } = await supabase
    .from("poker_room_players")
    .insert([
      {
        room_id: (room as Room).id,
        player_name: hostName,
        user_id: userId,
        seat_index: 0,
        is_host: true,
      },
    ] as never)
    .select()
    .single();
  if (playerErr) throw playerErr;

  return { ...(room as Room), players: [player as RoomPlayer] };
};

export const joinRoom = async (
  code: string,
  userId: string,
  playerName: string,
): Promise<RoomWithPlayers> => {
  const { data: room, error: roomErr } = await supabase
    .from("poker_rooms")
    .select("*")
    .eq("code", code.toUpperCase())
    .eq("status", "waiting")
    .maybeSingle();
  if (roomErr || !room) throw new Error("Room not found or already started");

  const { data: existing } = await supabase
    .from("poker_room_players")
    .select("*")
    .eq("room_id", (room as Room).id);

  const allPlayers = (existing ?? []) as RoomPlayer[];

  // Already seated — return current room state without inserting again
  if (allPlayers.some((p) => p.user_id === userId)) {
    return { ...(room as Room), players: allPlayers };
  }

  const seats = allPlayers.map((p) => p.seat_index);
  if (seats.length >= (room as Room).max_players)
    throw new Error("Room is full");

  const { data: player, error: playerErr } = await supabase
    .from("poker_room_players")
    .insert([
      {
        room_id: (room as Room).id,
        player_name: playerName,
        user_id: userId,
        seat_index: seats.length,
        is_host: false,
      },
    ] as never)
    .select()
    .single();
  if (playerErr) throw playerErr;

  return {
    ...(room as Room),
    players: [...allPlayers, player as RoomPlayer].sort(
      (a, b) => a.seat_index - b.seat_index,
    ),
  };
};

export const getMyWaitingRoom = async (
  userId: string,
): Promise<RoomWithPlayers | null> => {
  const { data: room } = await supabase
    .from("poker_rooms")
    .select("*")
    .eq("host_user_id", userId)
    .eq("status", "waiting")
    .maybeSingle();
  if (!room) return null;

  const { data: players } = await supabase
    .from("poker_room_players")
    .select("*")
    .eq("room_id", (room as Room).id)
    .order("seat_index");

  return { ...(room as Room), players: (players ?? []) as RoomPlayer[] };
};

export const getRoomPlayers = async (roomId: string): Promise<RoomPlayer[]> => {
  const { data } = await supabase
    .from("poker_room_players")
    .select("*")
    .eq("room_id", roomId)
    .order("seat_index");
  return (data as RoomPlayer[]) ?? [];
};

export const startRoom = async (roomId: string): Promise<void> => {
  const { error } = await supabase
    .from("poker_rooms")
    .update({ status: "playing" } as never)
    .eq("id", roomId);
  if (error) throw error;
};

export const listPublicRooms = async (
  gameMode?: RoomGameMode,
): Promise<RoomWithPlayers[]> => {
  let query = supabase
    .from("poker_rooms")
    .select("*")
    .eq("status", "waiting")
    .eq("is_private", false)
    .order("created_at", { ascending: false })
    .limit(20);

  if (gameMode) query = query.eq("game_mode", gameMode);

  const { data, error } = await query;
  if (error) {
    console.error("[room-api] listPublicRooms:", error.message);
    return [];
  }

  const rooms = (data ?? []) as Room[];
  const result: RoomWithPlayers[] = await Promise.all(
    rooms.map(async (r) => {
      const { data: players } = await supabase
        .from("poker_room_players")
        .select("*")
        .eq("room_id", r.id)
        .order("seat_index");
      return { ...r, players: (players ?? []) as RoomPlayer[] };
    }),
  );
  return result;
};

export const subscribeToRoom = (
  roomId: string,
  onPlayersChange: (players: RoomPlayer[]) => void,
  onGameStart: (gameMode: RoomGameMode) => void,
) => {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "poker_room_players",
        filter: `room_id=eq.${roomId}`,
      },
      async () => {
        const players = await getRoomPlayers(roomId);
        onPlayersChange(players);
      },
    )
    .on(
      "postgres_changes",
      {
        event: "UPDATE",
        schema: "public",
        table: "poker_rooms",
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        const updated = payload.new as Room;
        if (updated.status === "playing") onGameStart(updated.game_mode);
      },
    )
    .subscribe();

  return () => void supabase.removeChannel(channel);
};

// ── Host lifecycle ───────────────────────────────────────────────────────────

/** Immediately update host_last_seen so the server knows the host is alive. */
export const pingRoom = async (roomId: string): Promise<void> => {
  await supabase
    .from("poker_rooms")
    .update({ host_last_seen: new Date().toISOString() } as never)
    .eq("id", roomId);
};

/** Hard-delete the room (cascades to players and game_states). */
export const deleteRoom = async (roomId: string): Promise<void> => {
  const { error } = await supabase
    .from("poker_rooms")
    .delete()
    .eq("id", roomId);
  if (error) {
    console.error("[room-api] deleteRoom error:", error.message);
    throw error;
  }
};

/**
 * Start a 30-second heartbeat and register a `beforeunload` handler that
 * deletes the room immediately when the host closes the tab.
 * Returns a teardown function to cancel both.
 */
export const startHostHeartbeat = (roomId: string): (() => void) => {
  void pingRoom(roomId);
  const interval = setInterval(() => void pingRoom(roomId), 30_000);
  const onUnload = () => void deleteRoom(roomId);
  window.addEventListener("beforeunload", onUnload);
  return () => {
    clearInterval(interval);
    window.removeEventListener("beforeunload", onUnload);
  };
};

/**
 * Subscribe to DELETE events on the room row.
 * Fires `onDeleted` when the host disconnects and the room is cleaned up.
 */
export const subscribeToRoomDeletion = (
  roomId: string,
  onDeleted: () => void,
): (() => void) => {
  const channel = supabase
    .channel(`room-del:${roomId}`)
    .on(
      "postgres_changes",
      {
        event: "DELETE",
        schema: "public",
        table: "poker_rooms",
        filter: `id=eq.${roomId}`,
      },
      onDeleted,
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
};

export const subscribeToPublicRooms = (onUpdate: () => void) => {
  const channel = supabase
    .channel("public-rooms-watch")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "poker_rooms" },
      onUpdate,
    )
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "poker_room_players" },
      onUpdate,
    )
    .subscribe();

  return () => void supabase.removeChannel(channel);
};

export const leaveRoom = async (
  roomId: string,
  userId: string,
): Promise<void> => {
  const { data: player, error: fetchErr } = await supabase
    .from("poker_room_players")
    .select("is_host")
    .eq("room_id", roomId)
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[room-api] leaveRoom fetch error:", fetchErr.message);
    throw fetchErr;
  }

  if (player?.is_host) {
    // Host leaving deletes the room
    await deleteRoom(roomId);
  } else {
    // Guest leaving just removes them from the players list
    const { error: delErr } = await supabase
      .from("poker_room_players")
      .delete()
      .eq("room_id", roomId)
      .eq("user_id", userId);

    if (delErr) {
      console.error("[room-api] leaveRoom delete error:", delErr.message);
      throw delErr;
    }
  }
};
