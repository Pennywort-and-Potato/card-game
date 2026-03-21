import { supabase } from "./supabase";

export type RoomGameMode = "blackjack" | "poker" | "bigtwo";
export type RoomStatus = "waiting" | "playing" | "finished";

export interface Room {
  id: string;
  type: RoomGameMode;
  max_player: number;
  room_code: string;
  is_public: boolean;
  status: RoomStatus;
  created_at: string;
}

export interface RoomPlayer {
  id: string;
  room_id: string;
  player_id: string;
  is_room_owner: boolean;
  seat_index: number;
  joined_at: string;
  // joined from players table
  display_name: string;
  avatar: string;
  balance: number;
}

export interface RoomWithPlayers extends Room {
  players: RoomPlayer[];
}

const generateCode = (): string =>
  Math.random().toString(36).substring(2, 8).toUpperCase();

const maxPlayersForMode = (type: RoomGameMode): number => {
  if (type === "bigtwo") return 4;
  return 6;
};

/** Fetch room players with display_name joined from players table */
export const getRoomPlayers = async (roomId: string): Promise<RoomPlayer[]> => {
  const { data } = await supabase
    .from("room_players")
    .select("*, players(display_name, avatar, balance)")
    .eq("room_id", roomId)
    .order("seat_index");

  return ((data ?? []) as never[]).map((row: never) => {
    const r = row as {
      id: string;
      room_id: string;
      player_id: string;
      is_room_owner: boolean;
      seat_index: number;
      joined_at: string;
      players: { display_name: string; avatar: string; balance: number };
    };
    return {
      id: r.id,
      room_id: r.room_id,
      player_id: r.player_id,
      is_room_owner: r.is_room_owner,
      seat_index: r.seat_index,
      joined_at: r.joined_at,
      display_name: r.players?.display_name ?? "",
      avatar: r.players?.avatar ?? "",
      balance: r.players?.balance ?? 1000,
    };
  });
};

export const createRoom = async (
  type: RoomGameMode,
  playerId: string,
  _displayName: string,
  isPublic = true,
): Promise<RoomWithPlayers> => {
  const room_code = generateCode();
  const max_player = maxPlayersForMode(type);

  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .insert([{ type, max_player, room_code, is_public: isPublic }] as never)
    .select()
    .single();
  if (roomErr) throw roomErr;

  const { error: playerErr } = await supabase
    .from("room_players")
    .insert([
      {
        room_id: (room as Room).id,
        player_id: playerId,
        is_room_owner: true,
        seat_index: 0,
      },
    ] as never);
  if (playerErr) throw playerErr;

  const players = await getRoomPlayers((room as Room).id);
  return { ...(room as Room), players };
};

export const joinRoom = async (
  code: string,
  playerId: string,
  _displayName: string,
): Promise<RoomWithPlayers> => {
  void _displayName; // display_name comes from players table
  const { data: room, error: roomErr } = await supabase
    .from("rooms")
    .select("*")
    .eq("room_code", code.toUpperCase())
    .eq("status", "waiting")
    .maybeSingle();
  if (roomErr || !room) throw new Error("Room not found or already started");

  const existing = await getRoomPlayers((room as Room).id);

  if (existing.some((p) => p.player_id === playerId)) {
    return { ...(room as Room), players: existing };
  }

  if (existing.length >= (room as Room).max_player)
    throw new Error("Room is full");

  const { error: playerErr } = await supabase
    .from("room_players")
    .insert([
      {
        room_id: (room as Room).id,
        player_id: playerId,
        is_room_owner: false,
        seat_index: existing.length,
      },
    ] as never);
  if (playerErr) throw playerErr;

  const players = await getRoomPlayers((room as Room).id);
  return { ...(room as Room), players };
};

export const getMyWaitingRoom = async (
  playerId: string,
): Promise<RoomWithPlayers | null> => {
  const { data } = await supabase
    .from("room_players")
    .select("room_id, rooms(*)")
    .eq("player_id", playerId)
    .eq("is_room_owner", true)
    .maybeSingle();

  if (!data) return null;
  const roomRow = (data as unknown as { rooms: Room }).rooms;
  if (!roomRow || roomRow.status !== "waiting") return null;

  const players = await getRoomPlayers(roomRow.id);
  return { ...roomRow, players };
};

export const startRoom = async (roomId: string): Promise<void> => {
  const { error } = await supabase
    .from("rooms")
    .update({ status: "playing" } as never)
    .eq("id", roomId);
  if (error) throw error;
};

export const listPublicRooms = async (
  type?: RoomGameMode,
): Promise<RoomWithPlayers[]> => {
  let query = supabase
    .from("rooms")
    .select("*")
    .eq("status", "waiting")
    .eq("is_public", true)
    .order("created_at", { ascending: false })
    .limit(20);

  if (type) query = query.eq("type", type);

  const { data, error } = await query;
  if (error) {
    console.error("[room-api] listPublicRooms:", error.message);
    return [];
  }

  return Promise.all(
    ((data ?? []) as Room[]).map(async (r) => ({
      ...r,
      players: await getRoomPlayers(r.id),
    })),
  );
};

export const subscribeToRoom = (
  roomId: string,
  onPlayersChange: (players: RoomPlayer[]) => void,
  onGameStart: (type: RoomGameMode) => void,
) => {
  const channel = supabase
    .channel(`room:${roomId}`)
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: "room_players", filter: `room_id=eq.${roomId}` },
      async () => {
        const players = await getRoomPlayers(roomId);
        onPlayersChange(players);
      },
    )
    .on(
      "postgres_changes",
      { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      (payload) => {
        const updated = payload.new as Room;
        if (updated.status === "playing") onGameStart(updated.type);
      },
    )
    .subscribe();

  return () => void supabase.removeChannel(channel);
};

// ── Host lifecycle ───────────────────────────────────────────────────────────

export const pingRoom = async (roomId: string): Promise<void> => {
  await supabase
    .from("rooms")
    .update({ host_last_seen: new Date().toISOString() } as never)
    .eq("id", roomId);
};

export const deleteRoom = async (roomId: string): Promise<void> => {
  const { error } = await supabase.from("rooms").delete().eq("id", roomId);
  if (error) {
    console.error("[room-api] deleteRoom error:", error.message);
    throw error;
  }
};

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

export const subscribeToRoomDeletion = (
  roomId: string,
  onDeleted: () => void,
): (() => void) => {
  const channel = supabase
    .channel(`room-del:${roomId}`)
    .on(
      "postgres_changes",
      { event: "DELETE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` },
      onDeleted,
    )
    .subscribe();
  return () => void supabase.removeChannel(channel);
};

export const subscribeToPublicRooms = (onUpdate: () => void) => {
  const channel = supabase
    .channel("public-rooms-watch")
    .on("postgres_changes", { event: "*", schema: "public", table: "rooms" }, onUpdate)
    .on("postgres_changes", { event: "*", schema: "public", table: "room_players" }, onUpdate)
    .subscribe();
  return () => void supabase.removeChannel(channel);
};

export const leaveRoom = async (
  roomId: string,
  playerId: string,
): Promise<void> => {
  const { data: player, error: fetchErr } = await supabase
    .from("room_players")
    .select("is_room_owner")
    .eq("room_id", roomId)
    .eq("player_id", playerId)
    .maybeSingle();

  if (fetchErr) {
    console.error("[room-api] leaveRoom fetch error:", fetchErr.message);
    throw fetchErr;
  }

  if (player?.is_room_owner) {
    await deleteRoom(roomId);
  } else {
    const { error: delErr } = await supabase
      .from("room_players")
      .delete()
      .eq("room_id", roomId)
      .eq("player_id", playerId);

    if (delErr) {
      console.error("[room-api] leaveRoom delete error:", delErr.message);
      throw delErr;
    }
  }
};
