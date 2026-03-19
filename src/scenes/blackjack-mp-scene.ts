import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { SceneContainer, SceneManager } from "../systems/scene-manager";
import type { SceneParams } from "../types";
import { createCard } from "../entities/card";
import { createTableBackground } from "../utils/mock-graphics";
import { CARD_HEIGHT, CARD_WIDTH, SCREEN_WIDTH } from "../utils/constants";
import {
  calculateHandValue,
  createDeck,
  shouldDealerHit,
  shuffleDeck,
} from "../systems/blackjack-logic";
import type {
  BjMpPlayer,
  BlackjackMpState,
  PlayerAction,
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

const MP_BET = 50;

export const createBlackjackMpScene = (
  manager: SceneManager,
  params: SceneParams,
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "blackjack-mp-scene";

  const playerName = (params.playerName as string) ?? "Player";
  const roomId = params.roomId as string;
  const isHost = (params.isHost as boolean) ?? false;

  const cleanups: (() => void)[] = [];

  // ── PixiJS rendering layer ────────────────────────────────────────────────
  root.addChild(createTableBackground());

  const dynamicLayer = new Container();
  root.addChild(dynamicLayer);

  // ── HTML HUD overlay ──────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="bj-mp-back">← Menu</button>
      <span class="hud-title">BLACKJACK — MULTIPLAYER</span>
      <div style="width:90px"></div>
    </div>
    <div class="hud-status" id="bj-mp-status">Connecting…</div>
    <div class="hud-spacer"></div>
    <div class="hud-actions" id="bj-mp-actions" style="display:none">
      <button class="hud-btn hud-btn-green" id="bj-mp-hit" style="display:none">Hit</button>
      <button class="hud-btn hud-btn-red" id="bj-mp-stand" style="display:none">Stand</button>
      <button class="hud-btn hud-btn-gold" id="bj-mp-ready" style="display:none">▶ Deal Me In ($50)</button>
    </div>
    <div class="hud-players-panel" id="bj-mp-players" style="display:none">
      <div class="hud-players-title">Players</div>
      <div id="bj-mp-players-list"></div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  const statusEl = hud.querySelector<HTMLDivElement>("#bj-mp-status")!;
  const actionsEl = hud.querySelector<HTMLDivElement>("#bj-mp-actions")!;
  const hitBtnEl = hud.querySelector<HTMLButtonElement>("#bj-mp-hit")!;
  const standBtnEl = hud.querySelector<HTMLButtonElement>("#bj-mp-stand")!;
  const readyBtnEl = hud.querySelector<HTMLButtonElement>("#bj-mp-ready")!;
  const playersPanel = hud.querySelector<HTMLDivElement>("#bj-mp-players")!;
  const playersListEl = hud.querySelector<HTMLDivElement>(
    "#bj-mp-players-list",
  )!;

  hud
    .querySelector("#bj-mp-back")!
    .addEventListener("click", () => manager.goto("menu"));

  // ── Render ────────────────────────────────────────────────────────────────
  const render = (state: BlackjackMpState) => {
    while (dynamicLayer.children.length > 0) dynamicLayer.removeChildAt(0);

    const myPlayer = state.players.find((p) => p.name === playerName);
    const myTurn =
      state.phase === "player-turns" && state.active_player === playerName;

    // Dealer hand
    const dealerLbl = new Text({
      text: "DEALER",
      style: new TextStyle({ fontSize: 12, fill: "#aaaaaa", letterSpacing: 2 }),
    });
    dealerLbl.anchor.set(0.5, 0);
    dealerLbl.position.set(SCREEN_WIDTH / 2, 72);
    dynamicLayer.addChild(dealerLbl);

    const dCount = state.dealer_hand.length;
    if (dCount > 0) {
      const dStartX = SCREEN_WIDTH / 2 - (dCount * (CARD_WIDTH + 8)) / 2;
      state.dealer_hand.forEach((card, i) => {
        const c = createCard(card);
        c.position.set(dStartX + i * (CARD_WIDTH + 8), 88);
        dynamicLayer.addChild(c);
      });
      const visible = state.dealer_hand.filter((c) => c.isFaceUp);
      if (visible.length > 0) {
        const dv = calculateHandValue(visible);
        const dvT = new Text({
          text: dv.isBust ? "BUST!" : `${dv.value}`,
          style: new TextStyle({
            fontSize: 14,
            fill: dv.isBust ? "#ff4444" : "#cccccc",
          }),
        });
        dvT.anchor.set(0.5, 0);
        dvT.position.set(SCREEN_WIDTH / 2, 88 + CARD_HEIGHT + 6);
        dynamicLayer.addChild(dvT);
      }
    }

    // Player slots
    const count = state.players.length;
    const SLOT_W = Math.floor((SCREEN_WIDTH - 40) / count);
    const SLOT_Y = 255;
    const CARD_OFF = Math.min(38, Math.floor((SLOT_W - CARD_WIDTH - 8) / 4));

    state.players.forEach((player, i) => {
      const slotX = 20 + i * SLOT_W;
      const isMe = player.name === playerName;
      const isActive = state.active_player === player.name;

      if (isActive && state.phase === "player-turns") {
        const hl = new Graphics();
        hl.roundRect(slotX, SLOT_Y - 6, SLOT_W - 4, 228, 8);
        hl.stroke({ color: 0xd4af37, width: 2 });
        dynamicLayer.addChild(hl);
      }

      const nameT = new Text({
        text: `${player.name}${isMe ? " (You)" : ""}`,
        style: new TextStyle({
          fontSize: 12,
          fontWeight: "bold",
          fill: isMe ? "#d4af37" : "#cccccc",
        }),
      });
      nameT.anchor.set(0.5, 0);
      nameT.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y);
      dynamicLayer.addChild(nameT);

      const balT = new Text({
        text: `$${player.balance}  bet $${player.bet}`,
        style: new TextStyle({ fontSize: 11, fill: "#888888" }),
      });
      balT.anchor.set(0.5, 0);
      balT.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y + 16);
      dynamicLayer.addChild(balT);

      if (player.hand.length > 0) {
        player.hand.forEach((card, ci) => {
          const c = createCard({ ...card, isFaceUp: true });
          c.position.set(slotX + 4 + ci * CARD_OFF, SLOT_Y + 34);
          dynamicLayer.addChild(c);
        });
        const hv = calculateHandValue(
          player.hand.map((c) => ({ ...c, isFaceUp: true })),
        );
        const hvT = new Text({
          text: hv.isBust ? "BUST!" : `${hv.value}${hv.isSoft ? "s" : ""}`,
          style: new TextStyle({
            fontSize: 13,
            fontWeight: "bold",
            fill: hv.isBust ? "#ff4444" : "#ffffff",
          }),
        });
        hvT.anchor.set(0.5, 0);
        hvT.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y + 34 + CARD_HEIGHT + 4);
        dynamicLayer.addChild(hvT);
      }

      if (player.status === "betting") {
        const wt = new Text({
          text: "Waiting…",
          style: new TextStyle({ fontSize: 12, fill: "#666666" }),
        });
        wt.anchor.set(0.5, 0);
        wt.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y + 175);
        dynamicLayer.addChild(wt);
      }

      if (state.phase === "round-over" && player.result) {
        const rColor: Record<string, string> = {
          "player-win": "#2ecc71",
          "dealer-win": "#e74c3c",
          push: "#f39c12",
          blackjack: "#d4af37",
        };
        const rLabel: Record<string, string> = {
          "player-win": `WIN +$${player.bet}`,
          "dealer-win": `LOSE -$${player.bet}`,
          push: "PUSH",
          blackjack: `BJ +$${Math.floor(player.bet * 1.5)}`,
        };
        const rt = new Text({
          text: rLabel[player.result] ?? player.result,
          style: new TextStyle({
            fontSize: 14,
            fontWeight: "bold",
            fill: rColor[player.result] ?? "#fff",
          }),
        });
        rt.anchor.set(0.5, 0);
        rt.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y + 192);
        dynamicLayer.addChild(rt);
      }
    });

    // HUD: status
    if (state.phase === "betting") {
      const readied = state.players.filter(
        (p) => p.status !== "betting",
      ).length;
      statusEl.textContent = `Waiting for players (${readied}/${state.players.length} ready)…`;
    } else if (state.phase === "player-turns") {
      statusEl.textContent = myTurn
        ? "Your turn — Hit or Stand?"
        : `Waiting for ${state.active_player}…`;
    } else if (state.phase === "dealer-turn") {
      statusEl.textContent = "Dealer's turn…";
    } else if (state.phase === "round-over") {
      statusEl.textContent = isHost
        ? "Round over! Press Deal Again to continue."
        : "Round over!";
    }

    // HUD: action buttons
    actionsEl.style.display = "flex";
    hitBtnEl.style.display =
      myTurn && myPlayer?.status === "playing" ? "" : "none";
    standBtnEl.style.display =
      myTurn && myPlayer?.status === "playing" ? "" : "none";
    readyBtnEl.style.display =
      state.phase === "betting" && myPlayer?.status === "betting" ? "" : "none";
    hitBtnEl.disabled = false;
    standBtnEl.disabled = false;

    const anyVisible =
      hitBtnEl.style.display !== "none" ||
      standBtnEl.style.display !== "none" ||
      readyBtnEl.style.display !== "none";
    actionsEl.style.display = anyVisible ? "flex" : "none";

    // Deal again button (host at round-over)
    const existingDeal = actionsEl.querySelector("#bj-mp-deal-again");
    if (existingDeal) existingDeal.remove();
    if (state.phase === "round-over" && isHost) {
      actionsEl.style.display = "flex";
      const dealBtn = document.createElement("button");
      dealBtn.id = "bj-mp-deal-again";
      dealBtn.className = "hud-btn hud-btn-green";
      dealBtn.textContent = "Deal Again";
      dealBtn.addEventListener(
        "click",
        () => void startNewRound(state.players),
      );
      actionsEl.appendChild(dealBtn);
    }

    // HUD: players panel
    playersPanel.style.display = "";
    playersListEl.innerHTML = state.players
      .map((p) => {
        const isActive = state.active_player === p.name;
        const isMe = p.name === playerName;
        const cls = isActive ? "active" : isMe ? "me" : "";
        return `<div class="hud-player-row ${cls}">${p.name}${isMe ? " (You)" : ""} <span>$${p.balance}</span></div>`;
      })
      .join("");
  };

  // ── Host: game engine ────────────────────────────────────────────────────
  const advanceTurn = (state: BlackjackMpState): void => {
    const idx = state.players.findIndex((p) => p.name === state.active_player);
    for (let i = idx + 1; i < state.players.length; i++) {
      if (state.players[i].status === "playing") {
        state.active_player = state.players[i].name;
        return;
      }
    }
    state.active_player = null;
    state.phase = "dealer-turn";
  };

  const runDealerTurn = async (state: BlackjackMpState): Promise<void> => {
    if (state.dealer_hand[1]) {
      state.dealer_hand[1] = { ...state.dealer_hand[1], isFaceUp: true };
    }
    await pushGameState(roomId, state);

    const allFaceUp = (cards: typeof state.dealer_hand) =>
      cards.map((c) => ({ ...c, isFaceUp: true }));

    while (shouldDealerHit(allFaceUp(state.dealer_hand))) {
      await new Promise((r) => setTimeout(r, 700));
      const card = state.deck.shift()!;
      state.dealer_hand.push({ ...card, isFaceUp: true });
      await pushGameState(roomId, state);
    }

    const dv = calculateHandValue(allFaceUp(state.dealer_hand));
    state.players.forEach((p) => {
      if (p.status === "bust") {
        p.result = "dealer-win";
        p.balance -= p.bet;
        return;
      }
      const pv = calculateHandValue(
        p.hand.map((c) => ({ ...c, isFaceUp: true })),
      );
      if (dv.isBust || pv.value > dv.value) {
        if (p.status === "blackjack") {
          p.result = "blackjack";
          p.balance += Math.floor(p.bet * 1.5);
        } else {
          p.result = "player-win";
          p.balance += p.bet;
        }
      } else if (pv.value === dv.value) {
        p.result = "push";
      } else {
        p.result = "dealer-win";
        p.balance -= p.bet;
      }
      p.status = "done";
    });
    state.phase = "round-over";
    await pushGameState(roomId, state);
  };

  let processing = false;
  const queue: PlayerAction[] = [];

  const drainQueue = async (): Promise<void> => {
    if (processing || queue.length === 0) return;
    processing = true;
    const action = queue.shift()!;

    const fresh = await fetchGameState<BlackjackMpState>(roomId);
    if (!fresh) {
      processing = false;
      void drainQueue();
      return;
    }
    const state: BlackjackMpState = JSON.parse(
      JSON.stringify(fresh),
    ) as BlackjackMpState;

    if (action.action_type === "ready") {
      const p = state.players.find((x) => x.name === action.player_name);
      if (p && p.status === "betting") p.status = "playing";

      if (state.players.every((x) => x.status !== "betting")) {
        state.players.forEach((pl) => {
          pl.hand = [
            { ...state.deck.shift()!, isFaceUp: true },
            { ...state.deck.shift()!, isFaceUp: true },
          ];
          const hv = calculateHandValue(pl.hand);
          if (hv.isBlackjack) pl.status = "blackjack";
        });
        state.dealer_hand = [
          { ...state.deck.shift()!, isFaceUp: true },
          { ...state.deck.shift()!, isFaceUp: false },
        ];
        const first = state.players.find((x) => x.status === "playing");
        if (first) {
          state.phase = "player-turns";
          state.active_player = first.name;
        } else {
          state.phase = "dealer-turn";
          await pushGameState(roomId, state);
          processing = false;
          await runDealerTurn(state);
          void drainQueue();
          return;
        }
      }
      await pushGameState(roomId, state);
    } else if (
      action.action_type === "hit" &&
      state.active_player === action.player_name
    ) {
      const p = state.players.find((x) => x.name === action.player_name)!;
      p.hand = [...p.hand, { ...state.deck.shift()!, isFaceUp: true }];
      const hv = calculateHandValue(p.hand);
      if (hv.isBust) {
        p.status = "bust";
        advanceTurn(state);
      } else if (hv.value === 21) {
        p.status = "stand";
        advanceTurn(state);
      }
      await pushGameState(roomId, state);
      if (state.phase === "dealer-turn") {
        processing = false;
        await runDealerTurn(state);
        void drainQueue();
        return;
      }
    } else if (
      action.action_type === "stand" &&
      state.active_player === action.player_name
    ) {
      const p = state.players.find((x) => x.name === action.player_name)!;
      p.status = "stand";
      advanceTurn(state);
      await pushGameState(roomId, state);
      if (state.phase === "dealer-turn") {
        processing = false;
        await runDealerTurn(state);
        void drainQueue();
        return;
      }
    }

    processing = false;
    void drainQueue();
  };

  const startNewRound = async (prevPlayers: BjMpPlayer[]): Promise<void> => {
    const deck = shuffleDeck(createDeck());
    const state: BlackjackMpState = {
      phase: "betting",
      deck,
      dealer_hand: [],
      players: prevPlayers.map((p) => ({
        ...p,
        hand: [],
        status: "betting",
        result: null,
      })),
      active_player: null,
    };
    await pushGameState(roomId, state);
  };

  const initGame = async (): Promise<void> => {
    const roomPlayers = await getRoomPlayers(roomId);
    const deck = shuffleDeck(createDeck());
    const state: BlackjackMpState = {
      phase: "betting",
      deck,
      dealer_hand: [],
      players: roomPlayers.map((p) => ({
        name: p.player_name,
        hand: [],
        bet: MP_BET,
        balance: p.balance,
        status: "betting",
        result: null,
      })),
      active_player: null,
    };
    await pushGameState(roomId, state);
  };

  // ── Wire buttons ─────────────────────────────────────────────────────────
  hitBtnEl.addEventListener("click", () => {
    hitBtnEl.disabled = true;
    standBtnEl.disabled = true;
    void submitAction(roomId, playerName, "hit");
  });
  standBtnEl.addEventListener("click", () => {
    hitBtnEl.disabled = true;
    standBtnEl.disabled = true;
    void submitAction(roomId, playerName, "stand");
  });
  readyBtnEl.addEventListener("click", () => {
    readyBtnEl.style.display = "none";
    void submitAction(roomId, playerName, "ready");
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
    void fetchGameState<BlackjackMpState>(roomId).then((s) => {
      if (s) render(s);
    });
    cleanups.push(
      subscribeToRoomDeletion(roomId, () => {
        statusEl.textContent = "Host disconnected. Returning to menu…";
        setTimeout(() => manager.goto("menu"), 2000);
      }),
    );
  }

  cleanups.push(subscribeToGameState<BlackjackMpState>(roomId, render));

  root.__teardown = () => {
    cleanups.forEach((c) => c());
    hud.remove();
  };
  return root;
};
