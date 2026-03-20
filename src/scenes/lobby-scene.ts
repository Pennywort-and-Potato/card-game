import { Container, Graphics } from "pixi.js";
import type { SceneContainer, SceneManager } from "../systems/scene-manager";
import type { SceneParams } from "../types";
import type {
  RoomGameMode,
  RoomPlayer,
  RoomWithPlayers,
} from "../lib/room-api";
import {
  createRoom,
  getMyWaitingRoom,
  joinRoom,
  leaveRoom,
  listPublicRooms,
  startHostHeartbeat,
  startRoom,
  subscribeToPublicRooms,
  subscribeToRoom,
} from "../lib/room-api";
import { getCurrentUser } from "../lib/auth";
import {
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  STARTING_BALANCE,
} from "../utils/constants";

const GAME_MODE_LABELS: Record<RoomGameMode, string> = {
  blackjack: "Blackjack",
  poker: "Poker",
  bigtwo: "Big Two",
};

export const createLobbyScene = (
  manager: SceneManager,
  params: SceneParams,
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "lobby-scene";

  const playerName = (params.playerName as string) || "Player";
  const initialMode = (params.gameMode as RoomGameMode) ?? "blackjack";

  const selectedMode: RoomGameMode = initialMode;
  let currentRoom: RoomWithPlayers | null = null;
  let latestPlayers: RoomPlayer[] = [];
  let unsubscribeRoom: (() => void) | null = null;
  let stopHeartbeat: (() => void) | null = null;
  let unsubscribePublic: (() => void) | null = null;
  let publicRooms: RoomWithPlayers[] = [];
  let joinCode = "";
  let userId = "";
  let gameStarting = false;

  // Minimal PixiJS background
  const bg = new Graphics();
  bg.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0x08080f);
  root.addChild(bg);

  // ── HTML overlay ────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.className = "lobby-overlay";
  overlay.innerHTML = `
    <div class="lobby-topbar">
      <button class="lobby-back-btn" id="lobby-back">← Menu</button>
      <span class="lobby-topbar-title">${GAME_MODE_LABELS[selectedMode].toUpperCase()}</span>
      <div style="width:80px"></div>
    </div>

    <div class="lobby-playing-as" id="lobby-playing-as">Playing as: ${playerName}</div>

    <div class="lobby-body">
      <!-- Left: Open rooms -->
      <div class="lobby-panel">
        <div class="lobby-panel-header">
          <span class="lobby-panel-title">Open Rooms</span>
          <button class="lobby-refresh-btn" id="lobby-refresh">⟳ Refresh</button>
        </div>
        <div class="lobby-rooms-list" id="lobby-rooms-list">
          <div class="lobby-empty-msg">No open rooms — be the first to create one!</div>
        </div>
      </div>

      <!-- Right: Actions (default) / Room Info (when in room) -->
      <div class="lobby-panel">
        <!-- Default actions view -->
        <div class="lobby-right-content" id="lobby-right-content">
          <!-- Solo play -->
          <div>
            <div class="lobby-section-label">Solo Play</div>
            <button class="lobby-solo-btn" id="lobby-solo">▶  Play Solo (vs AI)</button>
          </div>

          <div class="lobby-divider"></div>

          <!-- Create room -->
          <div>
            <div class="lobby-section-label">Create Room</div>
            <div class="lobby-create-row">
              <button class="lobby-create-btn public" id="lobby-create-public" disabled>🌐 Public Room</button>
              <button class="lobby-create-btn private" id="lobby-create-private" disabled>🔒 Private Room</button>
            </div>
            <div class="lobby-status-text" id="lobby-create-status"></div>
            <div class="lobby-code-label" id="lobby-code-label" style="display:none">Share this code with friends:</div>
            <div class="lobby-code-display" id="lobby-code-display"></div>
          </div>

          <div class="lobby-divider"></div>

          <!-- Join with code -->
          <div>
            <div class="lobby-section-label">Join with Code</div>
            <div class="lobby-join-row">
              <input
                id="lobby-join-input"
                class="lobby-code-input"
                type="text"
                maxlength="6"
                placeholder="XXXXXX"
                autocomplete="off"
                spellcheck="false"
              />
              <button class="lobby-join-code-btn" id="lobby-join-btn" disabled>Join Room</button>
            </div>
            <div class="lobby-status-text" id="lobby-join-status"></div>
          </div>
        </div>

        <!-- Room info view (shown when in a room) -->
        <div class="lobby-right-content" id="lobby-room-info" style="display:none">
          <div class="lobby-section-label" id="lobby-room-title">Room</div>
          <div class="lobby-room-panel-players" id="lobby-room-players"></div>
          <div class="lobby-room-panel-waiting" id="lobby-room-waiting"></div>
          <div class="lobby-room-info-actions">
            <button class="lobby-leave-btn" id="lobby-leave-btn">Leave Room</button>
            <button class="lobby-start-btn" id="lobby-start-btn" style="display:none" disabled>▶ Start Game</button>
          </div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(overlay);

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const roomsList = overlay.querySelector<HTMLDivElement>("#lobby-rooms-list")!;
  const refreshBtn =
    overlay.querySelector<HTMLButtonElement>("#lobby-refresh")!;
  const soloBtn = overlay.querySelector<HTMLButtonElement>("#lobby-solo")!;
  const createPublicBtn = overlay.querySelector<HTMLButtonElement>(
    "#lobby-create-public",
  )!;
  const createPrivateBtn = overlay.querySelector<HTMLButtonElement>(
    "#lobby-create-private",
  )!;
  const createStatusEl = overlay.querySelector<HTMLDivElement>(
    "#lobby-create-status",
  )!;
  const codeLabelEl =
    overlay.querySelector<HTMLDivElement>("#lobby-code-label")!;
  const codeDisplayEl = overlay.querySelector<HTMLDivElement>(
    "#lobby-code-display",
  )!;
  const joinInput =
    overlay.querySelector<HTMLInputElement>("#lobby-join-input")!;
  const joinCodeBtn =
    overlay.querySelector<HTMLButtonElement>("#lobby-join-btn")!;
  const joinStatusEl =
    overlay.querySelector<HTMLDivElement>("#lobby-join-status")!;
  const rightContent = overlay.querySelector<HTMLDivElement>(
    "#lobby-right-content",
  )!;
  const roomInfoPanel =
    overlay.querySelector<HTMLDivElement>("#lobby-room-info")!;
  const roomTitleEl =
    overlay.querySelector<HTMLDivElement>("#lobby-room-title")!;
  const roomPlayersEl = overlay.querySelector<HTMLDivElement>(
    "#lobby-room-players",
  )!;
  const roomWaitingEl = overlay.querySelector<HTMLDivElement>(
    "#lobby-room-waiting",
  )!;
  const startGameBtn =
    overlay.querySelector<HTMLButtonElement>("#lobby-start-btn")!;
  const leaveRoomBtn =
    overlay.querySelector<HTMLButtonElement>("#lobby-leave-btn")!;

  // ── Fix B helper: prefer user_id, fall back to player_name ─────────────────
  const findMe = (players: RoomPlayer[]) =>
    players.find((p) =>
      p.user_id ? p.user_id === userId : p.player_name === playerName,
    );

  // ── Render room list ────────────────────────────────────────────────────────
  const renderRoomList = () => {
    const filtered = publicRooms.filter((r) => r.game_mode === selectedMode);
    if (filtered.length === 0) {
      roomsList.innerHTML = `<div class="lobby-empty-msg">No open rooms — be the first to create one!</div>`;
      return;
    }
    const alreadyIn = currentRoom !== null;
    roomsList.innerHTML = filtered
      .map((room) => {
        const isFull = room.players.length >= room.max_players;
        const disabled = isFull || alreadyIn;
        return `
          <div class="lobby-room-row" data-code="${room.code}">
            <div class="lobby-room-info">
              <div class="lobby-room-mode">${GAME_MODE_LABELS[room.game_mode]}</div>
              <div class="lobby-room-host">Host: ${room.host_name}</div>
              <div class="lobby-room-count">${room.players.length}/${room.max_players} players</div>
            </div>
            <button
              class="lobby-join-btn"
              data-code="${room.code}"
              ${disabled ? "disabled" : ""}
            >${isFull ? "Full" : "Join"}</button>
          </div>
        `;
      })
      .join("");

    roomsList
      .querySelectorAll<HTMLButtonElement>(".lobby-join-btn:not(:disabled)")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const code = btn.dataset.code!;
          void quickJoinRoom(code);
        });
      });
  };
  const renderSkeletons = () => {
    roomsList.innerHTML = [1, 2, 3]
      .map(
        () => `
          <div class="lobby-room-row skeleton">
            <div class="lobby-room-info">
              <div class="skeleton-bar" style="width: 60px; height: 12px; margin-bottom: 8px"></div>
              <div class="skeleton-bar" style="width: 120px; height: 14px; margin-bottom: 6px"></div>
              <div class="skeleton-bar" style="width: 80px; height: 11px"></div>
            </div>
            <div class="lobby-join-btn skeleton" style="width: 64px; height: 30px"></div>
          </div>
        `,
      )
      .join("");
  };

  const refreshPublicRooms = async () => {
    renderSkeletons();
    publicRooms = await listPublicRooms();
    renderRoomList();
  };

  // ── Update room panel ───────────────────────────────────────────────────────
  const updatePlayerList = (players: RoomPlayer[]) => {
    latestPlayers = players;
    if (!currentRoom) return;
    const mode = GAME_MODE_LABELS[currentRoom.game_mode];
    const privTag = currentRoom.is_private ? " 🔒 Private" : " 🌐 Public";
    roomTitleEl.textContent = `${mode}${privTag} · Code: ${currentRoom.code} (${players.length}/${currentRoom.max_players})`;
    roomPlayersEl.innerHTML = players
      .map(
        (p) =>
          `<div class="lobby-ri-player">${p.is_host ? "♛" : "○"} ${p.player_name}${p.is_host ? " (Host)" : ""}</div>`,
      )
      .join("");

    const me = findMe(players);
    const isHost = me?.is_host ?? false;
    const minPlayers = 2;
    const canStart = isHost && players.length >= minPlayers;

    startGameBtn.style.display = isHost ? "" : "none";
    startGameBtn.disabled = !canStart;

    if (!isHost) {
      roomWaitingEl.textContent = "Waiting for host to start the game…";
    } else if (players.length < minPlayers) {
      roomWaitingEl.textContent = `Need at least ${minPlayers} players to start.`;
    } else {
      roomWaitingEl.textContent = "Ready to start!";
    }

    rightContent.style.display = "none";
    roomInfoPanel.style.display = "";
    createPublicBtn.disabled = true;
    createPrivateBtn.disabled = true;
    joinCodeBtn.disabled = true;
  };

  const amIHost = () => findMe(currentRoom?.players ?? [])?.is_host ?? false;

  const enterRoom = (room: RoomWithPlayers) => {
    currentRoom = room;
    updatePlayerList(room.players);

    if (amIHost()) {
      stopHeartbeat?.();
      stopHeartbeat = startHostHeartbeat(room.id);
    }

    unsubscribeRoom?.();
    unsubscribeRoom = subscribeToRoom(
      room.id,
      (players) => updatePlayerList(players),
      (gameMode) => {
        if (currentRoom) currentRoom = { ...currentRoom, status: "playing" };
        gameStarting = true;
        const isHost = findMe(latestPlayers)?.is_host ?? false;
        manager.goto(gameMode === "bigtwo" ? "bigtwo" : gameMode, {
          playerName,
          userId,
          balance: STARTING_BALANCE,
          roomId: room.id,
          isHost,
        });
      },
    );

    renderRoomList();
  };

  const quickJoinRoom = async (code: string) => {
    joinStatusEl.textContent = "Joining…";
    try {
      const room = await joinRoom(code, userId, playerName);
      joinStatusEl.textContent = "";
      enterRoom(room);
    } catch (err) {
      joinStatusEl.textContent = `Error: ${(err as Error).message}`;
    }
  };

  // Fix C: guard doCreateRoom
  const doCreateRoom = async (isPrivate: boolean) => {
    if (!userId) {
      createStatusEl.textContent = "Loading…";
      return;
    }
    createStatusEl.textContent = "Creating…";
    createPublicBtn.disabled = true;
    createPrivateBtn.disabled = true;
    try {
      const room = await createRoom(
        selectedMode,
        userId,
        playerName,
        isPrivate,
      );
      createStatusEl.textContent = "";
      if (isPrivate) {
        codeLabelEl.style.display = "";
        codeDisplayEl.textContent = room.code;
      }
      enterRoom(room);
      void refreshPublicRooms();
    } catch (err) {
      createStatusEl.textContent = `Error: ${(err as Error).message}`;
      createPublicBtn.disabled = false;
      createPrivateBtn.disabled = false;
    }
  };

  // ── Wire buttons ─────────────────────────────────────────────────────────────
  overlay
    .querySelector("#lobby-back")!
    .addEventListener("click", () => manager.goto("menu"));

  refreshBtn.addEventListener("click", () => void refreshPublicRooms());

  soloBtn.addEventListener("click", () => {
    const sceneName =
      selectedMode === "bigtwo"
        ? "bigtwo"
        : (selectedMode as "blackjack" | "poker");
    manager.goto(sceneName, { playerName, balance: STARTING_BALANCE });
  });

  createPublicBtn.addEventListener("click", () => void doCreateRoom(false));
  createPrivateBtn.addEventListener("click", () => void doCreateRoom(true));

  joinInput.addEventListener("input", () => {
    joinCode = joinInput.value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 6);
    joinInput.value = joinCode;
    joinCodeBtn.disabled = joinCode.length !== 6 || !!currentRoom;
  });

  joinInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && joinCode.length === 6 && !currentRoom) {
      void quickJoinRoom(joinCode);
    }
  });

  joinCodeBtn.addEventListener("click", () => {
    if (joinCode.length === 6 && !currentRoom) void quickJoinRoom(joinCode);
  });

  startGameBtn.addEventListener("click", async () => {
    if (!currentRoom) return;
    startGameBtn.disabled = true;
    try {
      await startRoom(currentRoom.id);
      currentRoom = { ...currentRoom, status: "playing" };
      gameStarting = true;
      manager.goto(
        currentRoom.game_mode === "bigtwo" ? "bigtwo" : currentRoom.game_mode,
        {
          playerName,
          userId,
          balance: STARTING_BALANCE,
          roomId: currentRoom.id,
          isHost: true,
        },
      );
    } catch (err) {
      console.error("startRoom error:", err);
      startGameBtn.disabled = false;
    }
  });

  leaveRoomBtn.addEventListener("click", async () => {
    if (!currentRoom) return;
    leaveRoomBtn.disabled = true;
    try {
      await leaveRoom(currentRoom.id, userId);

      // Reset local state
      currentRoom = null;
      unsubscribeRoom?.();
      unsubscribeRoom = null;
      stopHeartbeat?.();
      stopHeartbeat = null;

      // Reset UI
      roomInfoPanel.style.display = "none";
      rightContent.style.display = "";
      createPublicBtn.disabled = false;
      createPrivateBtn.disabled = false;
      joinCodeBtn.disabled = joinCode.length !== 6;
      codeLabelEl.style.display = "none";
      codeDisplayEl.textContent = "";

      void refreshPublicRooms();
    } catch (err) {
      console.error("leaveRoom error:", err);
      leaveRoomBtn.disabled = false;
    }
  });

  // ── Initial data load ────────────────────────────────────────────────────────
  void refreshPublicRooms();
  unsubscribePublic = subscribeToPublicRooms(() => void refreshPublicRooms());

  // Fix A + load auth user + auto-restore
  void (async () => {
    const user = await getCurrentUser();
    if (!user) {
      manager.goto("auth");
      return;
    }
    userId = user.id;
    // Fix A: re-enable create buttons now that userId is loaded
    if (!currentRoom) {
      createPublicBtn.disabled = false;
      createPrivateBtn.disabled = false;
    }

    const existing = await getMyWaitingRoom(userId);
    if (existing) enterRoom(existing);
  })();

  // ── Teardown ─────────────────────────────────────────────────────────────────
  root.__teardown = () => {
    if (
      currentRoom &&
      amIHost() &&
      currentRoom.status === "waiting" &&
      !gameStarting
    ) {
      void leaveRoom(currentRoom.id, userId);
    }
    unsubscribeRoom?.();
    unsubscribePublic?.();
    stopHeartbeat?.();
    overlay.remove();
  };

  return root;
};
