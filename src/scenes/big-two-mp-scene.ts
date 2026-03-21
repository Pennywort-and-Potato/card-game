import { Assets, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { SceneContainer, SceneManager } from "../systems/scene-manager";
import type { CardData, SceneParams } from "../types";
import { createCard } from "../entities/card";
import { CARD_HEIGHT, CARD_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH } from "../utils/constants";
import {
  canBeat,
  comboLabel,
  createBigTwoDeck,
  dealCards,
  detectCombo,
  findThreeOfSpadesOwner,
  findStartingCard,
  getCardValue,
  isValidFirstPlay,
  sortHand,
} from "../systems/big-two-logic";
import type {
  PlayerAction,
  BigTwoMpState,
  BigTwoMpPlayer,
} from "../lib/game-state-api";
import {
  fetchGameState,
  pushGameState,
  saveMatchResult,
  submitAction,
  subscribeToActions,
  subscribeToGameState,
} from "../lib/game-state-api";
import {
  getRoomPlayers,
  leaveRoom,
  startHostHeartbeat,
  subscribeToRoomDeletion,
} from "../lib/room-api";

// ── Layout constants ─────────────────────────────────────────────────────────

const HAND_Y = 515;
const COMBO_Y = 295;

const OPP_SLOT_W = 180;
const OPP_SLOT_H = 80;
const LOCAL_SLOT_W = 380;
const LOCAL_SLOT_H = 52;

// Pixel-art colour palette
const C_PANEL = 0x0c0c20;
const C_BORDER = 0x252548;
const C_GOLD = 0xd4af37;
const C_MUTED = 0x555577;

type SlotLayout = {
  player: BigTwoMpPlayer;
  x: number;
  y: number;
  w: number;
  h: number;
  isLocal: boolean;
};

function buildLayout(players: BigTwoMpPlayer[], myId: string): SlotLayout[] {
  const me = players.find((p) => p.id === myId);
  const opps = players.filter((p) => p.id !== myId);

  // Opponent anchor grid (top-left of each slot)
  const oppAnchors: Array<{ x: number; y: number }> = (() => {
    if (opps.length === 1) return [{ x: 551, y: 8 }];
    if (opps.length === 2)
      return [
        { x: 324, y: 8 },
        { x: 776, y: 8 },
      ];
    return [
      { x: 4, y: 296 },
      { x: 551, y: 8 },
      { x: 1096, y: 296 },
    ];
  })();

  const result: SlotLayout[] = opps.map((p, i) => ({
    player: p,
    x: oppAnchors[i].x,
    y: oppAnchors[i].y,
    w: OPP_SLOT_W,
    h: OPP_SLOT_H,
    isLocal: false,
  }));

  if (me) {
    result.push({
      player: me,
      x: 16,
      y: 655,
      w: LOCAL_SLOT_W,
      h: LOCAL_SLOT_H,
      isLocal: true,
    });
  }
  return result;
}

// ── Pixel-art drawing helpers ────────────────────────────────────────────────

function pixelPanel(
  g: Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  active: boolean,
) {
  const borderCol = active ? C_GOLD : C_BORDER;
  g.rect(x, y, w, h).fill(0x02020e);
  g.rect(x + 2, y + 2, w - 4, h - 4).fill(C_PANEL);
  g.rect(x, y, w, h).stroke({ color: borderCol, width: 2 });
  // pixel corner accents
  const ac = active ? 0xffdd55 : 0x303060;
  for (const [cx, cy] of [
    [x, y],
    [x + w - 3, y],
    [x, y + h - 3],
    [x + w - 3, y + h - 3],
  ]) {
    g.rect(cx, cy, 3, 3).fill(ac);
  }
}

function playerInitialsColor(name: string): number {
  const hues = [0x5555ff, 0xff5577, 0x55ffaa, 0xffaa22, 0xaa55ff, 0x22ccff];
  let h = 0;
  for (let i = 0; i < name.length; i++)
    h = (h * 31 + name.charCodeAt(i)) & 0xffff;
  return hues[h % hues.length];
}

function addText(
  container: Container,
  text: string,
  x: number,
  y: number,
  size: number,
  fill: string,
  bold = false,
) {
  const t = new Text({
    text,
    style: new TextStyle({
      fontSize: size,
      fill,
      fontWeight: bold ? "bold" : "normal",
      fontFamily: "monospace",
    }),
  });
  t.position.set(x, y);
  container.addChild(t);
  return t;
}

function placeLabel(rank: number): string {
  return ["1ST", "2ND", "3RD", "4TH"][rank - 1] ?? `${rank}TH`;
}

// ── Draw one opponent slot ───────────────────────────────────────────────────

function drawOppSlot(
  container: Container,
  sd: SlotLayout,
  state: BigTwoMpState,
  isActive: boolean,
) {
  const { player: p, x, y, w, h } = sd;
  const g = new Graphics();
  pixelPanel(g, x, y, w, h, isActive);

  // Avatar box (40 × 40)
  const avatarCol = playerInitialsColor(p.name);
  g.rect(x + 6, y + 6, 40, 40).fill(0x080820);
  g.rect(x + 6, y + 6, 40, 40).stroke({ color: avatarCol, width: 1 });
  container.addChild(g);

  const initials = p.name.slice(0, 2).toUpperCase();
  addText(
    container,
    initials,
    x + 14,
    y + 16,
    13,
    `#${avatarCol.toString(16).padStart(6, "0")}`,
    true,
  );

  // Name
  const displayName = p.name.length > 11 ? p.name.slice(0, 10) + "…" : p.name;
  addText(
    container,
    displayName,
    x + 54,
    y + 7,
    10,
    isActive ? "#ffd700" : "#ccccee",
    true,
  );

  // Phase-specific status
  if (state.phase === "lobby") {
    const rdy = (state.ready_players ?? []).includes(p.id);
    addText(
      container,
      rdy ? "✔ READY" : "waiting…",
      x + 54,
      y + 26,
      9,
      rdy ? "#4ade80" : "#555577",
    );
  } else if (state.phase === "playing") {
    const cnt = p.hand.length;
    addText(
      container,
      p.finished ? "FINISHED" : `${cnt} card${cnt !== 1 ? "s" : ""}`,
      x + 54,
      y + 26,
      9,
      p.finished ? "#4ade80" : "#aaddaa",
    );
    if (isActive)
      addText(container, "▶ TURN", x + 54, y + 42, 8, "#ffd700", true);
  } else {
    const rank = p.finish_rank;
    const isLastPlace = rank === state.players.length;
    const col = rank === 1 ? "#ffd700" : isLastPlace ? "#f87171" : "#aaaadd";
    addText(
      container,
      rank ? placeLabel(rank) : "?",
      x + 54,
      y + 26,
      10,
      col,
      true,
    );
    if (isLastPlace && p.hand.length === 2) {
      addText(container, "💀 x2 PENALTY", x + 54, y + 42, 8, "#ff4444", true);
    }
  }

  // Card count mini-badge (playing phase)
  if (state.phase === "playing" && !p.finished) {
    const cnt = p.hand.length;
    for (let i = 0; i < Math.min(cnt, 8); i++) {
      const bg2 = new Graphics();
      bg2.rect(x + 7 + i * 7, y + h - 12, 6, 8).fill(0x1a1a6a);
      container.addChild(bg2);
    }
  }
}

// ── Draw local player slot ───────────────────────────────────────────────────

function drawLocalSlot(
  container: Container,
  sd: SlotLayout,
  state: BigTwoMpState,
  isActive: boolean,
) {
  const { player: p, x, y, w, h } = sd;
  const g = new Graphics();
  pixelPanel(g, x, y, w, h, isActive);

  // Avatar
  const avatarCol = playerInitialsColor(p.name);
  g.rect(x + 6, y + 6, 40, 40).fill(0x080820);
  g.rect(x + 6, y + 6, 40, 40).stroke({ color: avatarCol, width: 1 });
  container.addChild(g);

  const initials = p.name.slice(0, 2).toUpperCase();
  addText(
    container,
    initials,
    x + 14,
    y + 14,
    13,
    `#${avatarCol.toString(16).padStart(6, "0")}`,
    true,
  );

  // Name
  const displayName = p.name.length > 13 ? p.name.slice(0, 12) + "…" : p.name;
  addText(
    container,
    displayName + " (You)",
    x + 54,
    y + 8,
    10,
    isActive ? "#ffd700" : "#eeeeff",
    true,
  );

  if (state.phase === "lobby") {
    const rdy = (state.ready_players ?? []).includes(p.id);
    addText(
      container,
      rdy ? "✔  READY" : "press READY to start",
      x + 54,
      y + 27,
      9,
      rdy ? "#4ade80" : "#888899",
    );
  } else if (state.phase === "playing") {
    const cnt = p.hand.length;
    const status = p.finished
      ? "FINISHED"
      : isActive
        ? "▶ YOUR TURN"
        : `${cnt} card${cnt !== 1 ? "s" : ""}`;
    addText(
      container,
      status,
      x + 54,
      y + 27,
      9,
      p.finished ? "#4ade80" : isActive ? "#ffd700" : "#aaddaa",
      isActive,
    );
  } else {
    const rank = p.finish_rank;
    const isLastPlace = rank === state.players.length;
    const col = rank === 1 ? "#ffd700" : isLastPlace ? "#f87171" : "#aaaadd";
    addText(
      container,
      rank ? placeLabel(rank) : "?",
      x + 54,
      y + 27,
      10,
      col,
      true,
    );
    if (isLastPlace && p.hand.length === 2) {
      addText(container, "💀 x2 PENALTY", x + 54, y + 40, 8, "#ff4444", true);
    }
  }
}

// ════════════════════════════════════════════════════════════════════════════

export const createBigTwoMpScene = (
  manager: SceneManager,
  params: SceneParams,
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "big-two-mp-scene";

  const roomId = params.roomId as string;
  const userId = params.playerId as string;
  const isHost = (params.isHost as boolean) ?? false;

  let gs: BigTwoMpState | null = null;
  let myHandSorted: CardData[] = [];
  const selectedIndices = new Set<number>();
  const cleanups: (() => void)[] = [];
  let animRaf: number | null = null;

  // ── Glow ──────────────────────────────────────────────────────────────────
  let glowAlpha = 0.5;
  let glowDir = 1;
  const glowGraphics = new Graphics();

  const glowInterval = setInterval(() => {
    glowAlpha = Math.max(0.1, Math.min(0.95, glowAlpha + glowDir * 0.035));
    if (glowAlpha >= 0.95) glowDir = -1;
    if (glowAlpha <= 0.1) glowDir = 1;
    glowGraphics.alpha = glowAlpha;
  }, 16);

  // ── PixiJS layers ────────────────────────────────────────────────────────
  const bg = new Graphics(Assets.get("assets/bg/bg.svg"));
  bg.scale.set(SCREEN_WIDTH / 1920);
  root.addChild(bg);

  const slotsLayer = new Container();
  const comboLayer = new Container();
  const handLayer = new Container();
  const animLayer = new Container();
  const glowLayer = new Container();

  const logLayer = new Container();

  root.addChild(slotsLayer, comboLayer, handLayer, animLayer, glowLayer, logLayer);
  glowLayer.addChild(glowGraphics);

  // ── PixiJS status text (top-center) ──────────────────────────────────────
  const statusText = new Text({
    text: "",
    style: new TextStyle({
      fontSize: 14,
      fill: "#ffffff",
      fontFamily: "monospace",
      align: "center",
      dropShadow: { color: 0x000000, distance: 1, blur: 4, alpha: 0.9 },
    }),
  });
  statusText.anchor.set(0.5, 0.5);
  statusText.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);
  root.addChild(statusText);

  // ── PixiJS play log ───────────────────────────────────────────────────────
  // Safe zone: x=8 y=110 h=180 clears all opponent slots in every config.
  // (3-player left slot is at x=4 y=296, so we end at y=290)
  const LOG_X = 8;
  const LOG_Y = 110;
  const LOG_W = 270;
  const LOG_LINE_H = 18;
  const LOG_PAD = 8;
  const LOG_MAX_LINES = 9;

  const playLog: string[] = [];
  let prevCurrentPlayer: string | null | undefined = undefined;
  let prevLastPlayedBy: string | null | undefined = undefined;

  function renderLog() {
    clearLayer(logLayer);
    const lines = playLog.slice(-LOG_MAX_LINES);
    if (lines.length === 0) return;
    const panelH = lines.length * LOG_LINE_H + LOG_PAD * 2 + 4;
    const panel = new Graphics();
    panel
      .roundRect(LOG_X, LOG_Y, LOG_W, panelH, 5)
      .fill({ color: 0x020210, alpha: 0.78 });
    panel
      .roundRect(LOG_X, LOG_Y, LOG_W, panelH, 5)
      .stroke({ color: 0x252548, width: 1 });
    logLayer.addChild(panel);
    lines.forEach((line, i) => {
      const t = new Text({
        text: line,
        style: new TextStyle({
          fontSize: 11,
          fill: "#9999bb",
          fontFamily: "monospace",
          wordWrap: true,
          wordWrapWidth: LOG_W - LOG_PAD * 2,
        }),
      });
      t.position.set(LOG_X + LOG_PAD, LOG_Y + LOG_PAD + 2 + i * LOG_LINE_H);
      logLayer.addChild(t);
    });
  }

  function addToLog(msg: string) {
    playLog.push(msg);
    if (playLog.length > 60) playLog.shift();
    renderLog();
  }

  // ── HTML HUD ──────────────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="bt-mp-back">← Menu</button>
      <div style="width:90px"></div>
    </div>
    <div class="hud-spacer"></div>
    <div style="text-align:center;font-size:12px;color:#f87171;padding:0 16px 4px;pointer-events:none" id="bt-mp-hint"></div>
    <div class="hud-actions" id="bt-mp-actions" style="display:none"></div>
    <div id="bt-mp-lobby-center" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none">
      <div style="font-size:52px;font-weight:bold;color:#d4af37;font-family:monospace;letter-spacing:6px;text-shadow:0 2px 16px rgba(0,0,0,0.95)">BIG TWO</div>
      <div id="bt-mp-lobby-status" style="font-size:15px;color:#aaaacc;margin-top:16px;text-shadow:0 1px 4px rgba(0,0,0,0.8)">Connecting…</div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  const hintEl = hud.querySelector<HTMLDivElement>("#bt-mp-hint")!;
  const actionsEl = hud.querySelector<HTMLDivElement>("#bt-mp-actions")!;
  const lobbyCenterEl = hud.querySelector<HTMLDivElement>("#bt-mp-lobby-center")!;
  const lobbyStatusEl = hud.querySelector<HTMLDivElement>("#bt-mp-lobby-status")!;

  hud.querySelector("#bt-mp-back")!.addEventListener("click", async () => {
    await leaveRoom(roomId, userId);
    manager.goto("menu");
  });

  // ── HUD action panels ────────────────────────────────────────────────────

  function showLobbyActions(isReady: boolean) {
    actionsEl.style.display = "flex";
    const alreadyReady = isReady;
    actionsEl.innerHTML = `
      <button class="hud-btn ${alreadyReady ? "bt-ready-done" : "bt-ready-btn"}" id="bt-mp-ready"
        ${alreadyReady ? "disabled" : ""}>
        ${alreadyReady ? "✔ READY!" : "▶ READY"}
      </button>
    `;
    if (!alreadyReady) {
      actionsEl.querySelector("#bt-mp-ready")!.addEventListener("click", () => {
        void submitAction(roomId, userId, "ready");
        showLobbyActions(true);
      });
    }
  }

  function showPlayActions() {
    actionsEl.style.display = "flex";
    actionsEl.innerHTML = `
      <button class="hud-btn hud-btn-green" id="bt-mp-play" disabled>Play</button>
      <button class="hud-btn hud-btn-grey"  id="bt-mp-pass" disabled>Pass</button>
    `;
    actionsEl.querySelector("#bt-mp-play")!.addEventListener("click", () => void onPlay());
    actionsEl.querySelector("#bt-mp-pass")!.addEventListener("click", onPass);
  }

  function showGameOverActions() {
    actionsEl.style.display = "flex";
    if (isHost) {
      actionsEl.innerHTML = `<button class="hud-btn bt-ready-btn" id="bt-mp-again">▶ PLAY AGAIN</button>`;
      actionsEl
        .querySelector("#bt-mp-again")!
        .addEventListener("click", () => void resetToLobby());
    } else {
      actionsEl.innerHTML = `<span style="color:#6b7280;font-size:12px">Waiting for host…</span>`;
    }
  }

  // ── Rendering ────────────────────────────────────────────────────────────

  function clearLayer(layer: Container) {
    while (layer.children.length > 0) layer.removeChildAt(0);
  }

  function renderSlots(state: BigTwoMpState) {
    clearLayer(slotsLayer);
    glowGraphics.clear();

    const slots = buildLayout(state.players, userId);
    const currentPlayer =
      state.phase === "playing" ? state.current_player : null;

    for (const sd of slots) {
      const isActive = sd.player.id === currentPlayer;
      if (sd.isLocal) {
        drawLocalSlot(slotsLayer, sd, state, isActive);
      } else {
        drawOppSlot(slotsLayer, sd, state, isActive);
      }

      if (isActive) {
        // Glow rect for current turn — alpha animated via setInterval
        glowGraphics
          .rect(sd.x - 4, sd.y - 4, sd.w + 8, sd.h + 8)
          .stroke({ color: C_GOLD, width: 3 });
        glowGraphics
          .rect(sd.x - 7, sd.y - 7, sd.w + 14, sd.h + 14)
          .stroke({ color: C_GOLD, width: 1 });
      }
    }
  }

  function renderCombo(state: BigTwoMpState) {
    clearLayer(comboLayer);
    if (state.phase === "lobby") return;

    if (!state.last_combo) {
      // Lead placeholder
      const bg2 = new Graphics();
      bg2.rect(SCREEN_WIDTH / 2 - 115, COMBO_Y - 30, 230, 62).fill(0x05050f);
      bg2
        .rect(SCREEN_WIDTH / 2 - 115, COMBO_Y - 30, 230, 62)
        .stroke({ color: C_MUTED, width: 1 });
      comboLayer.addChild(bg2);
      addText(
        comboLayer,
        "LEAD THE ROUND",
        SCREEN_WIDTH / 2 - 80,
        COMBO_Y - 8,
        10,
        "#404460",
      );
      return;
    }

    const cards = state.last_combo.cards;
    const GAP = Math.min(28, 560 / Math.max(cards.length, 1));
    const totalW = (cards.length - 1) * GAP + CARD_WIDTH;
    const startX = SCREEN_WIDTH / 2 - totalW / 2;

    cards.forEach((card, i) => {
      const c = createCard({ ...card, isFaceUp: true });
      c.position.set(startX + i * GAP, COMBO_Y - CARD_HEIGHT / 2);
      comboLayer.addChild(c);
    });

  }

  function renderHand(state: BigTwoMpState) {
    clearLayer(handLayer);
    selectedIndices.clear();

    const myPlayer = state.players.find((p) => p.id === userId);
    if (!myPlayer || myPlayer.finished || state.phase !== "playing") return;

    const isMyTurn = state.current_player === userId;
    const hand = sortHand(myPlayer.hand);
    myHandSorted = hand;

    const CARD_OFF = Math.min(
      38,
      Math.floor((SCREEN_WIDTH - 120) / Math.max(hand.length, 1)),
    );
    const totalW = (hand.length - 1) * CARD_OFF + CARD_WIDTH;
    const startX = SCREEN_WIDTH / 2 - totalW / 2;

    hand.forEach((card, i) => {
      const c = createCard({ ...card, isFaceUp: true });
      c.position.set(startX + i * CARD_OFF, HAND_Y);

      if (isMyTurn) {
        c.eventMode = "static";
        c.cursor = "pointer";
        c.on("pointerdown", () => {
          hintEl.textContent = "";
          if (selectedIndices.has(i)) {
            selectedIndices.delete(i);
            c.y = HAND_Y;
          } else {
            selectedIndices.add(i);
            c.y = HAND_Y - 18;
          }
          updatePlayBtn(state);
        });
      }
      handLayer.addChild(c);
    });

    updatePlayBtn(state);
  }

  function updatePlayBtn(state: BigTwoMpState) {
    const playBtn = actionsEl.querySelector<HTMLButtonElement>("#bt-mp-play");
    const passBtn = actionsEl.querySelector<HTMLButtonElement>("#bt-mp-pass");
    if (!playBtn) return;

    const isMyTurn = state.current_player === userId;
    if (!isMyTurn) {
      playBtn.disabled = true;
      if (passBtn) passBtn.disabled = true;
      return;
    }

    if (passBtn) passBtn.disabled = !state.last_combo || state.is_first_move;

    if (selectedIndices.size === 0) {
      playBtn.disabled = true;
      return;
    }
    const selected = [...selectedIndices].map((i) => myHandSorted[i]);
    const combo = detectCombo(selected);
    if (!combo) {
      playBtn.disabled = true;
      return;
    }

    if (state.is_first_move) {
      playBtn.disabled = !isValidFirstPlay(
        combo,
        state.start_card ?? { rank: "3", suit: "spades", isFaceUp: true },
      );
      return;
    }
    if (!state.last_combo) {
      playBtn.disabled = false;
      return;
    }
    playBtn.disabled = !canBeat(combo, state.last_combo);
  }

  function updateHudStatus(state: BigTwoMpState) {
    if (state.phase === "lobby") {
      const n = (state.ready_players ?? []).length;
      lobbyStatusEl.textContent = `Waiting for players… (${n}/${state.players.length} ready)`;
      statusText.text = "";
    } else if (state.phase === "playing") {
      const isMyTurn = state.current_player === userId;
      if (isMyTurn) {
        const scLabel = state.start_card
          ? `${state.start_card.rank}${{ hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" }[state.start_card.suit]}`
          : "3♠";
        statusText.text = state.is_first_move
          ? `Your turn! Must include ${scLabel}`
          : state.last_combo
            ? `Beat: ${comboLabel(state.last_combo)}`
            : "Your turn — play anything";
      } else {
        const currentPlayer = state.players.find(
          (p) => p.id === state.current_player,
        );
        statusText.text = `Waiting for ${currentPlayer?.name ?? state.current_player}…`;
      }
    } else {
      statusText.text = "Game over!";
    }
  }

  const render = (state: BigTwoMpState) => {
    gs = state;

    // Normalise missing field (old states)
    if (!state.ready_players) state.ready_players = [];

    renderSlots(state);
    renderCombo(state);
    renderHand(state);
    updateHudStatus(state);

    // Toggle lobby overlay vs in-game PixiJS elements
    const isLobby = state.phase === "lobby";
    lobbyCenterEl.style.display = isLobby ? "flex" : "none";
    logLayer.visible = !isLobby;
    statusText.visible = !isLobby;

    // Track plays and passes for the log
    if (state.phase === "playing") {
      if (prevCurrentPlayer !== undefined && prevLastPlayedBy !== undefined) {
        if (state.last_played_by !== prevLastPlayedBy && state.last_played_by != null) {
          const player = state.players.find((p) => p.id === state.last_played_by);
          const name = player?.name ?? state.last_played_by;
          addToLog(`${name} played ${state.last_combo ? comboLabel(state.last_combo) : "cards"}`);
        } else if (prevCurrentPlayer !== null && state.current_player !== prevCurrentPlayer) {
          const player = state.players.find((p) => p.id === prevCurrentPlayer);
          if (player) addToLog(`${player.name} passed`);
        }
      }
      prevCurrentPlayer = state.current_player ?? null;
      prevLastPlayedBy = state.last_played_by ?? null;
    }

    const myRdy = state.ready_players.includes(userId);

    if (state.phase === "lobby") {
      showLobbyActions(myRdy);
    } else if (state.phase === "playing") {
      const isMyTurn = state.current_player === userId;
      actionsEl.style.display = isMyTurn ? "flex" : "none";
      if (!actionsEl.querySelector("#bt-mp-play")) showPlayActions();
      if (isMyTurn) updatePlayBtn(state);
    } else {
      showGameOverActions();
    }
  };

  // ── Card fly animation ───────────────────────────────────────────────────

  function animateCardFly(
    positions: Array<{ x: number; y: number }>,
    onComplete: () => void,
  ) {
    if (animRaf !== null) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
    clearLayer(animLayer);

    const DURATION = 280;
    const targetX = SCREEN_WIDTH / 2 - CARD_WIDTH / 2;
    const targetY = COMBO_Y - CARD_HEIGHT / 2;
    const startMs = performance.now();

    const clones = positions.map(({ x: startX, y: startY }) => {
      const g = new Graphics();
      g.rect(0, 0, CARD_WIDTH, CARD_HEIGHT)
        .fill(0xf8f8f8)
        .stroke({ color: C_GOLD, width: 2 });
      g.position.set(startX, startY);
      animLayer.addChild(g);
      return { g, startX, startY };
    });

    function tick(now: number) {
      const t = Math.min((now - startMs) / DURATION, 1);
      const e = 1 - Math.pow(1 - t, 3); // ease-out cubic
      for (const { g, startX, startY } of clones) {
        g.x = startX + (targetX - startX) * e;
        g.y = startY + (targetY - startY) * e;
        g.alpha = 1 - t * 0.5;
      }
      if (t < 1) {
        animRaf = requestAnimationFrame(tick);
      } else {
        clearLayer(animLayer);
        animRaf = null;
        onComplete();
      }
    }
    animRaf = requestAnimationFrame(tick);
  }

  // ── Button handlers ───────────────────────────────────────────────────────

  async function onPlay() {
    if (!gs || gs.phase !== "playing") return;
    hintEl.textContent = "";

    const myPlayer = gs.players.find((p) => p.id === userId);
    if (!myPlayer) return;

    const hand = sortHand(myPlayer.hand);
    const indices = [...selectedIndices].sort((a, b) => a - b);
    const selected = indices.map((i) => hand[i]);
    const combo = detectCombo(selected);
    if (!combo) {
      hintEl.textContent = "Not a valid combination!";
      return;
    }
    if (
      gs.is_first_move &&
      !isValidFirstPlay(
        combo,
        gs.start_card ?? { rank: "3", suit: "spades", isFaceUp: true },
      )
    ) {
      const sc = gs.start_card;
      const label =
        sc && !(sc.rank === "3" && sc.suit === "spades")
          ? `${sc.rank}${{ hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" }[sc.suit]}`
          : "3♠";
      hintEl.textContent = `First play must include ${label}!`;
      return;
    }
    if (gs.last_combo && !canBeat(combo, gs.last_combo)) {
      hintEl.textContent = `Can't beat the current ${gs.last_combo.type}!`;
      return;
    }

    const playBtn = actionsEl.querySelector<HTMLButtonElement>("#bt-mp-play");
    const passBtn = actionsEl.querySelector<HTMLButtonElement>("#bt-mp-pass");
    if (playBtn) playBtn.disabled = true;
    if (passBtn) passBtn.disabled = true;

    await submitAction(roomId, userId, "play", { indices });

    // Capture positions before removing cards from the hand display
    const positions = indices.map((i) => {
      const child = handLayer.children[i] as Container | undefined;
      return { x: child?.x ?? SCREEN_WIDTH / 2, y: child?.y ?? HAND_Y };
    });

    // Remove played cards from hand (reverse order to keep indices valid)
    [...indices].reverse().forEach((i) => {
      if (i < handLayer.children.length) handLayer.removeChildAt(i);
    });

    // Re-layout remaining cards to close gaps before animation
    const remaining = handLayer.children.length;
    if (remaining > 0) {
      const CARD_OFF = Math.min(38, Math.floor((SCREEN_WIDTH - 120) / remaining));
      const totalW = (remaining - 1) * CARD_OFF + CARD_WIDTH;
      const startX = SCREEN_WIDTH / 2 - totalW / 2;
      handLayer.children.forEach((child, i) => {
        (child as Container).x = startX + i * CARD_OFF;
        (child as Container).y = HAND_Y;
      });
    }

    animateCardFly(positions, () => {});
  }

  function onPass() {
    if (!gs || gs.phase !== "playing") return;
    const playBtn = actionsEl.querySelector<HTMLButtonElement>("#bt-mp-play");
    const passBtn = actionsEl.querySelector<HTMLButtonElement>("#bt-mp-pass");
    if (playBtn) playBtn.disabled = true;
    if (passBtn) passBtn.disabled = true;
    void submitAction(roomId, userId, "pass");
  }

  // ── Host: game engine ─────────────────────────────────────────────────────

  const nextTurn = (state: BigTwoMpState, fromId: string): void => {
    const idx = state.players.findIndex((p: BigTwoMpPlayer) => p.id === fromId);
    const n = state.players.length;
    for (let i = 1; i < n; i++) {
      const next = state.players[(idx + i) % n];
      if (!next.finished) {
        state.current_player = next.id;
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

    const fresh = await fetchGameState<BigTwoMpState>(roomId);
    if (!fresh) {
      processing = false;
      void drainQueue();
      return;
    }

    const state: BigTwoMpState = JSON.parse(
      JSON.stringify(fresh),
    ) as BigTwoMpState;
    if (!state.ready_players) state.ready_players = [];

    // ── READY action ────────────────────────────────────────────────────
    if (action.action_type === "ready") {
      if (!state.ready_players.includes(action.player_id)) {
        state.ready_players.push(action.player_id);
      }
      if (state.ready_players.length >= state.players.length) {
        // All ready — deal cards and start!
        const deck = createBigTwoDeck();
        const hands = dealCards(deck, state.players.length);
        state.players.forEach((p, i) => {
          p.hand = sortHand(hands[i]).map((c: CardData) => ({
            ...c,
            isFaceUp: true,
          }));
          p.finished = false;
          p.finish_rank = null;
        });
        const handsArr = state.players.map((p) => p.hand);
        const lastWinnerIdx = state.last_winner
          ? state.players.findIndex((p) => p.id === state.last_winner)
          : -1;
        const firstIdx =
          lastWinnerIdx >= 0 ? lastWinnerIdx : findThreeOfSpadesOwner(handsArr);
        state.phase = "playing";
        state.current_player = state.players[firstIdx].id;
        state.last_winner = undefined;
        // Winner of the previous round starts freely — skip start-card constraint.
        state.is_first_move = lastWinnerIdx >= 0 ? false : true;
        state.start_card = lastWinnerIdx >= 0 ? null : findStartingCard(handsArr);
        state.last_combo = null;
        state.last_played_by = null;
        state.passed = [];
        state.finish_order = [];
      }
      await pushGameState(roomId, state);
      processing = false;
      void drainQueue();
      return;
    }

    // ── PASS action ─────────────────────────────────────────────────────
    if (action.action_type === "pass") {
      if (
        state.phase !== "playing" ||
        state.current_player !== action.player_id ||
        state.is_first_move
      ) {
        processing = false;
        void drainQueue();
        return;
      }
      if (!state.passed.includes(action.player_id))
        state.passed.push(action.player_id);
      nextTurn(state, action.player_id);

      const active = state.players.filter((p: BigTwoMpPlayer) => !p.finished);
      const allPassedExceptLast = active.every(
        (p: BigTwoMpPlayer) =>
          p.id === state.last_played_by || state.passed.includes(p.id),
      );
      if (allPassedExceptLast && state.last_played_by) {
        state.last_combo = null;
        state.passed = [];
        const winner = state.players.find(
          (p: BigTwoMpPlayer) => p.id === fresh.last_played_by,
        );
        if (winner && !winner.finished) state.current_player = winner.id;
        else nextTurn(state, state.current_player);
        state.last_played_by = null;
      }
      await pushGameState(roomId, state);
    }

    // ── PLAY action ─────────────────────────────────────────────────────
    else if (action.action_type === "play") {
      if (
        state.phase !== "playing" ||
        state.current_player !== action.player_id
      ) {
        processing = false;
        void drainQueue();
        return;
      }
      const player = state.players.find(
        (p: BigTwoMpPlayer) => p.id === action.player_id,
      );
      if (!player) {
        processing = false;
        void drainQueue();
        return;
      }

      const hand = sortHand(player.hand);
      const idxs = (action.payload.indices as number[]) ?? [];
      const selected = idxs.map((i) => hand[i]);
      const combo = detectCombo(selected);
      if (!combo) {
        processing = false;
        void drainQueue();
        return;
      }
      if (
        state.is_first_move &&
        !isValidFirstPlay(
          combo,
          state.start_card ?? { rank: "3", suit: "spades", isFaceUp: true },
        )
      ) {
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

      const playedVals = new Set(
        selected.map((c: CardData) => getCardValue(c)),
      );
      player.hand = hand.filter(
        (c: CardData) => !playedVals.has(getCardValue(c)),
      );

      state.last_combo = combo;
      state.last_played_by = action.player_id;
      state.passed = [];
      state.is_first_move = false;
      if (!state.thoi_hai) state.thoi_hai = [];

      if (player.hand.length === 0) {
        // "Thới 2" rule: if the final play contains any rank-2 card, the player
        // is penalized — marked finished but placed last instead of winning.
        const isThoiHai = combo.cards.some((c: CardData) => c.rank === "2");

        player.finished = true;
        if (isThoiHai) {
          state.thoi_hai.push(player.id);
        } else {
          player.finish_rank = state.finish_order.length + 1;
          state.finish_order.push(player.id);
        }

        const remaining = state.players.filter(
          (p: BigTwoMpPlayer) => !p.finished,
        );
        if (remaining.length <= 1) {
          if (remaining.length === 1) {
            remaining[0].finished = true;
            remaining[0].finish_rank = state.finish_order.length + 1;
            state.finish_order.push(remaining[0].id);
          }
          // Append thới 2 players at the end — they always finish last
          for (const id of state.thoi_hai) {
            if (!state.finish_order.includes(id)) state.finish_order.push(id);
          }
          state.phase = "game-over";
          // Persist match result BEFORE pushing game-over state so the
          // room still exists (room deletion cascades to match_results in old schema).
          const finishOrderNames = state.finish_order.map((id) => ({
            id,
            name: state.players.find((p: BigTwoMpPlayer) => p.id === id)?.name ?? id,
          }));
          await saveMatchResult(
            roomId,
            "bigtwo",
            state.finish_order[0] ?? null,
            finishOrderNames,
          ).catch((e: Error) => console.error("[bigtwo-mp] saveMatchResult failed:", e.message));
          await pushGameState(roomId, state);
          processing = false;
          void drainQueue();
          return;
        }
      }
      nextTurn(state, action.player_id);
      await pushGameState(roomId, state);
    }

    processing = false;
    void drainQueue();
  };

  // ── initGame: push lobby state ───────────────────────────────────────────

  const initGame = async (): Promise<void> => {
    const roomPlayers = await getRoomPlayers(roomId);
    const players: BigTwoMpPlayer[] = roomPlayers.map((rp) => ({
      id: rp.player_id,
      name: rp.display_name,
      hand: [],
      finished: false,
      finish_rank: null,
    }));
    const state: BigTwoMpState = {
      phase: "lobby",
      players,
      ready_players: [],
      current_player: "",
      last_combo: null,
      last_played_by: null,
      passed: [],
      is_first_move: true,
      finish_order: [],
      thoi_hai: [],
      start_card: null,
    };
    await pushGameState(roomId, state);
  };

  // ── resetToLobby (Play Again) ─────────────────────────────────────────────

  const resetToLobby = async (): Promise<void> => {
    const fresh = await fetchGameState<BigTwoMpState>(roomId);
    if (!fresh) return;
    const state: BigTwoMpState = {
      ...fresh,
      phase: "lobby",
      ready_players: [],
      current_player: "",
      last_combo: null,
      last_played_by: null,
      passed: [],
      is_first_move: true,
      finish_order: [],
      thoi_hai: [],
      last_winner: fresh.finish_order[0] ?? undefined,
      players: fresh.players.map((p) => ({
        ...p,
        hand: [],
        finished: false,
        finish_rank: null,
      })),
    };
    await pushGameState(roomId, state);
  };

  // ── Subscribe / init ─────────────────────────────────────────────────────

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
    void fetchGameState<BigTwoMpState>(roomId).then((s) => {
      if (s) render(s);
    });
    cleanups.push(
      subscribeToRoomDeletion(roomId, () => {
        statusText.text = "Host disconnected. Returning to menu…";
        setTimeout(() => manager.goto("menu"), 2500);
      }),
    );
  }

  cleanups.push(subscribeToGameState<BigTwoMpState>(roomId, render));

  // ── Teardown ─────────────────────────────────────────────────────────────
  root.__teardown = () => {
    if (animRaf !== null) {
      cancelAnimationFrame(animRaf);
      animRaf = null;
    }
    clearInterval(glowInterval);
    cleanups.forEach((c) => c());
    hud.remove();
  };

  return root;
};
