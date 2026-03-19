import { Container, Graphics } from "pixi.js";
import type { SceneContainer, SceneManager } from "../systems/scene-manager";
import type { SceneParams } from "../types";
import { createCard } from "../entities/card";
import { createTableBackground } from "../utils/mock-graphics";
import { CARD_WIDTH, SCREEN_WIDTH } from "../utils/constants";
import {
  canBeat,
  comboLabel,
  createTienLenDeck,
  dealCards,
  detectCombo,
  findThreeOfClubsOwner,
  getCardValue,
  isValidFirstPlay,
  sortHand,
} from "../systems/tienlen-logic";
import type {
  PlayerAction,
  TienLenMpState,
  TLMpPlayer,
} from "../lib/game-state-api";
import {
  fetchGameState,
  pushGameState,
  submitAction,
  subscribeToActions,
  subscribeToGameState,
} from "../lib/game-state-api";
import {
  getRoomPlayers,
  startHostHeartbeat,
  subscribeToRoomDeletion,
} from "../lib/room-api";

export const createTienLenMpScene = (
  manager: SceneManager,
  params: SceneParams,
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "tienlen-mp-scene";

  const playerName = (params.playerName as string) ?? "Player";
  const roomId = params.roomId as string;
  const isHost = (params.isHost as boolean) ?? false;

  let gs: TienLenMpState | null = null;
  const cleanups: (() => void)[] = [];
  const selectedIndices = new Set<number>();

  // ── PixiJS rendering layer ───────────────────────────────────────────────
  root.addChild(createTableBackground());

  const dynamicLayer = new Container();
  root.addChild(dynamicLayer);

  const handLayer = new Container();
  root.addChild(handLayer);

  // ── HTML HUD overlay ─────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="tl-mp-back">← Menu</button>
      <span class="hud-title">TIẾN LÊN — MULTIPLAYER</span>
      <div style="width:90px"></div>
    </div>
    <div class="hud-status" id="tl-mp-status">Connecting…</div>
    <div class="hud-spacer"></div>
    <div class="hud-actions" id="tl-mp-actions" style="display:none">
      <button class="hud-btn hud-btn-green" id="tl-mp-play" disabled>Play</button>
      <button class="hud-btn hud-btn-grey" id="tl-mp-pass" style="display:none" disabled>Pass</button>
    </div>
    <div class="hud-players-panel" id="tl-mp-players" style="display:none">
      <div class="hud-players-title">Players</div>
      <div id="tl-mp-players-list"></div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  const statusEl = hud.querySelector<HTMLDivElement>("#tl-mp-status")!;
  const actionsEl = hud.querySelector<HTMLDivElement>("#tl-mp-actions")!;
  const playBtnEl = hud.querySelector<HTMLButtonElement>("#tl-mp-play")!;
  const passBtnEl = hud.querySelector<HTMLButtonElement>("#tl-mp-pass")!;
  const playersPanel = hud.querySelector<HTMLDivElement>("#tl-mp-players")!;
  const playersListEl = hud.querySelector<HTMLDivElement>(
    "#tl-mp-players-list",
  )!;

  hud
    .querySelector("#tl-mp-back")!
    .addEventListener("click", () => manager.goto("menu"));

  // ── Render ───────────────────────────────────────────────────────────────
  const renderHand = (state: TienLenMpState) => {
    while (handLayer.children.length > 0) handLayer.removeChildAt(0);
    selectedIndices.clear();

    const myPlayer = state.players.find((p) => p.name === playerName);
    if (!myPlayer || myPlayer.finished) {
      actionsEl.style.display = "none";
      return;
    }

    const isMyTurn = state.current_player === playerName;
    const hand = sortHand(myPlayer.hand);
    const HAND_Y = 560;
    const CARD_OFF = Math.min(
      38,
      Math.floor((SCREEN_WIDTH - 80) / hand.length),
    );

    hand.forEach((card, i) => {
      const c = createCard({ ...card, isFaceUp: true });
      c.position.set(40 + i * CARD_OFF, HAND_Y);
      if (isMyTurn) {
        c.eventMode = "static";
        c.cursor = "pointer";
        c.on("pointerdown", () => {
          if (selectedIndices.has(i)) {
            selectedIndices.delete(i);
            c.position.set(40 + i * CARD_OFF, HAND_Y);
          } else {
            selectedIndices.add(i);
            c.position.set(40 + i * CARD_OFF, HAND_Y - 14);
          }
          updatePlayBtn(state);
        });
      }
      handLayer.addChild(c);
    });

    actionsEl.style.display = isMyTurn ? "flex" : "none";
    passBtnEl.style.display = isMyTurn && !state.is_first_move ? "" : "none";
    playBtnEl.disabled = true;
    passBtnEl.disabled = false;
    updatePlayBtn(state);
  };

  const updatePlayBtn = (state: TienLenMpState) => {
    const myPlayer = state.players.find((p) => p.name === playerName);
    if (!myPlayer) return;
    const hand = sortHand(myPlayer.hand);
    const selected = [...selectedIndices].map((i) => hand[i]);
    const combo = detectCombo(selected);

    if (!combo) {
      playBtnEl.disabled = true;
      return;
    }

    if (state.is_first_move) {
      playBtnEl.disabled = !isValidFirstPlay(combo);
    } else if (!state.last_combo) {
      playBtnEl.disabled = false;
    } else {
      playBtnEl.disabled = !canBeat(combo, state.last_combo);
    }
  };

  const render = (state: TienLenMpState) => {
    gs = state;
    while (dynamicLayer.children.length > 0) dynamicLayer.removeChildAt(0);

    // Last played combo (center)
    if (state.last_combo) {
      const comboY = 280;
      const comboCards = state.last_combo.cards;
      const startX =
        SCREEN_WIDTH / 2 - (comboCards.length * (CARD_WIDTH + 6)) / 2;
      comboCards.forEach((card, i) => {
        const c = createCard({ ...card, isFaceUp: true });
        c.position.set(startX + i * (CARD_WIDTH + 6), comboY);
        dynamicLayer.addChild(c);
      });
    }

    // Opponent info slots (top area)
    const opponents = state.players.filter((p) => p.name !== playerName);
    const OPP_SLOT_W = Math.floor(
      (SCREEN_WIDTH - 40) / Math.max(opponents.length, 1),
    );

    opponents.forEach((opp, i) => {
      const slotX = 20 + i * OPP_SLOT_W;
      const isActive = state.current_player === opp.name;

      if (isActive) {
        const hl = new Graphics();
        hl.roundRect(slotX, 72, OPP_SLOT_W - 4, 140, 8);
        hl.stroke({ color: 0xd4af37, width: 2 });
        dynamicLayer.addChild(hl);
      }

      const maxShow = Math.min(opp.hand.length, 8);
      const BACK_OFF = Math.min(
        22,
        Math.floor((OPP_SLOT_W - 20) / Math.max(maxShow, 1)),
      );
      for (let ci = 0; ci < maxShow; ci++) {
        const c = createCard({ suit: "spades", rank: "A", isFaceUp: false });
        c.scale.set(0.6);
        c.position.set(slotX + 10 + ci * BACK_OFF, 108);
        dynamicLayer.addChild(c);
      }
    });

    // HUD: status
    if (state.phase === "game-over") {
      statusEl.textContent =
        "Game Over!  " +
        state.finish_order.map((n, i) => `#${i + 1} ${n}`).join("  ");
      if (isHost) {
        actionsEl.style.display = "flex";
        actionsEl.innerHTML = `<button class="hud-btn hud-btn-green" id="tl-mp-again">Play Again</button>`;
        actionsEl
          .querySelector("#tl-mp-again")!
          .addEventListener("click", () => void initGame());
      } else {
        actionsEl.style.display = "none";
      }
    } else if (state.current_player === playerName) {
      statusEl.textContent = state.is_first_move
        ? "Your turn! Must include 3♠"
        : state.last_combo
          ? `Beat: ${comboLabel(state.last_combo)}`
          : "Your turn — play anything";
    } else {
      statusEl.textContent = `Waiting for ${state.current_player}…`;
    }

    // HUD: players panel
    playersPanel.style.display = "";
    playersListEl.innerHTML = state.players
      .map((p) => {
        const isActive = state.current_player === p.name;
        const isMe = p.name === playerName;
        const cls = isActive ? "active" : isMe ? "me" : "";
        return `<div class="hud-player-row ${cls}">${p.name}${isMe ? " (You)" : ""}${p.finished ? " ✓" : ""} <span>${p.hand.length}c</span></div>`;
      })
      .join("");

    renderHand(state);
  };

  // ── Host: game engine ────────────────────────────────────────────────────
  const nextTurn = (state: TienLenMpState, fromName: string): void => {
    const idx = state.players.findIndex((p) => p.name === fromName);
    const n = state.players.length;
    for (let i = 1; i < n; i++) {
      const next = state.players[(idx + i) % n];
      if (!next.finished) {
        state.current_player = next.name;
        return;
      }
    }
  };

  let processing = false;
  const queue: PlayerAction[] = [];

  const drainQueue = async (): Promise<void> => {
    if (processing || queue.length === 0) return;
    processing = true;
    const action = queue.shift()!;

    const fresh = await fetchGameState<TienLenMpState>(roomId);
    if (!fresh) {
      processing = false;
      void drainQueue();
      return;
    }
    const state: TienLenMpState = JSON.parse(
      JSON.stringify(fresh),
    ) as TienLenMpState;

    if (state.phase === "game-over") {
      processing = false;
      void drainQueue();
      return;
    }

    const player = state.players.find((p) => p.name === action.player_name);

    if (action.action_type === "pass") {
      if (state.current_player !== action.player_name || state.is_first_move) {
        processing = false;
        void drainQueue();
        return;
      }
      if (!state.passed.includes(action.player_name)) {
        state.passed.push(action.player_name);
      }
      nextTurn(state, action.player_name);

      const activePlayers = state.players.filter((p) => !p.finished);
      const allPassedExceptLast = activePlayers.every(
        (p) => p.name === state.last_played_by || state.passed.includes(p.name),
      );
      if (allPassedExceptLast && state.last_played_by) {
        state.last_combo = null;
        state.last_played_by = null;
        state.passed = [];
        state.current_player = state.last_played_by ?? state.current_player;
        const lastPlayedIdx = state.players.findIndex(
          (p) => p.name === (fresh.last_played_by ?? ""),
        );
        if (lastPlayedIdx >= 0) {
          state.current_player = state.players[lastPlayedIdx].name;
          if (state.players[lastPlayedIdx].finished) {
            nextTurn(state, state.players[lastPlayedIdx].name);
          }
        }
      }

      await pushGameState(roomId, state);
    } else if (action.action_type === "play") {
      if (state.current_player !== action.player_name) {
        processing = false;
        void drainQueue();
        return;
      }
      const cardIndices = (action.payload.indices as number[]) ?? [];
      if (!player) {
        processing = false;
        void drainQueue();
        return;
      }
      const hand = sortHand(player.hand);
      const selected = cardIndices.map((i) => hand[i]);
      const combo = detectCombo(selected);
      if (!combo) {
        processing = false;
        void drainQueue();
        return;
      }

      if (state.is_first_move && !isValidFirstPlay(combo)) {
        processing = false;
        void drainQueue();
        return;
      }
      if (
        !state.is_first_move &&
        state.last_combo &&
        !canBeat(combo, state.last_combo)
      ) {
        processing = false;
        void drainQueue();
        return;
      }

      const playedValues = new Set(selected.map((c) => getCardValue(c)));
      player.hand = hand.filter((c) => !playedValues.has(getCardValue(c)));

      state.last_combo = combo;
      state.last_played_by = action.player_name;
      state.passed = [];
      state.is_first_move = false;

      if (player.hand.length === 0) {
        player.finished = true;
        player.finish_rank = state.finish_order.length + 1;
        state.finish_order.push(player.name);

        const remaining = state.players.filter((p) => !p.finished);
        if (remaining.length <= 1) {
          if (remaining.length === 1) {
            remaining[0].finished = true;
            remaining[0].finish_rank = state.finish_order.length + 1;
            state.finish_order.push(remaining[0].name);
          }
          state.phase = "game-over";
          await pushGameState(roomId, state);
          processing = false;
          void drainQueue();
          return;
        }
      }

      nextTurn(state, action.player_name);
      await pushGameState(roomId, state);
    }

    processing = false;
    void drainQueue();
  };

  const initGame = async (): Promise<void> => {
    const roomPlayers = await getRoomPlayers(roomId);
    const numPlayers = roomPlayers.length;
    const deck = createTienLenDeck();
    const hands = dealCards(deck, numPlayers);

    const players: TLMpPlayer[] = roomPlayers.map((p, i) => ({
      name: p.player_name,
      hand: sortHand(hands[i]).map((c) => ({ ...c, isFaceUp: true })),
      finished: false,
      finish_rank: null,
    }));

    const handsArr = players.map((p) => p.hand);
    const firstPlayerIdx = findThreeOfClubsOwner(handsArr);

    const state: TienLenMpState = {
      phase: "playing",
      players,
      current_player: players[firstPlayerIdx].name,
      last_combo: null,
      last_played_by: null,
      passed: [],
      is_first_move: true,
      finish_order: [],
    };
    await pushGameState(roomId, state);
  };

  // ── Wire buttons ─────────────────────────────────────────────────────────
  playBtnEl.addEventListener("click", () => {
    if (!gs) return;
    const myPlayer = gs.players.find((p) => p.name === playerName);
    if (!myPlayer) return;
    const hand = sortHand(myPlayer.hand);
    const indices = [...selectedIndices].sort((a, b) => a - b);
    const selected = indices.map((i) => hand[i]);
    const combo = detectCombo(selected);
    if (!combo) return;

    playBtnEl.disabled = true;
    passBtnEl.disabled = true;
    void submitAction(roomId, playerName, "play", { indices });
  });

  passBtnEl.addEventListener("click", () => {
    playBtnEl.disabled = true;
    passBtnEl.disabled = true;
    void submitAction(roomId, playerName, "pass");
  });

  if (isHost) {
    cleanups.push(startHostHeartbeat(roomId));
    cleanups.push(
      subscribeToActions(roomId, (a) => {
        queue.push(a);
        void drainQueue();
      }),
    );
    void initGame();
  } else {
    void fetchGameState<TienLenMpState>(roomId).then((s) => {
      if (s) render(s);
    });
    cleanups.push(
      subscribeToRoomDeletion(roomId, () => {
        statusEl.textContent = "Host disconnected. Returning to menu…";
        setTimeout(() => manager.goto("menu"), 2000);
      }),
    );
  }

  cleanups.push(subscribeToGameState<TienLenMpState>(roomId, render));

  root.__teardown = () => {
    cleanups.forEach((c) => c());
    hud.remove();
  };
  return root;
};
