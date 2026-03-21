import { Assets, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { SceneContainer, SceneManager } from "../systems/scene-manager";
import type { SceneParams } from "../types";
import { createCard } from "../entities/card";
import { CARD_HEIGHT, CARD_WIDTH, SCREEN_WIDTH } from "../utils/constants";
import {
  comparePokerHands,
  createDeck,
  evaluateBestHand,
  shuffleDeck,
} from "../systems/poker-logic";
import type {
  PlayerAction,
  PokerMpPlayer,
  PokerMpState,
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
  leaveRoom,
  startHostHeartbeat,
  subscribeToRoomDeletion,
} from "../lib/room-api";

const ANTE = 10;
const RAISE_AMOUNT = 50;

export const createPokerMpScene = (
  manager: SceneManager,
  params: SceneParams,
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "poker-mp-scene";

  const roomId = params.roomId as string;
  const userId = params.playerId as string;
  const isHost = (params.isHost as boolean) ?? false;

  let gs: PokerMpState | null = null;
  const cleanups: (() => void)[] = [];

  // ── PixiJS rendering layer ────────────────────────────────────────────────
  const bg = new Graphics(Assets.get("assets/bg/bg.svg"));
  bg.scale.set(SCREEN_WIDTH / 1920);
  root.addChild(bg);

  const dynamicLayer = new Container();
  root.addChild(dynamicLayer);

  // ── HTML HUD overlay ──────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="pk-mp-back">← Menu</button>
      <span class="hud-title">POKER</span>
      <div class="hud-pot" id="pk-mp-pot">Pot: $0</div>
    </div>
    <div class="hud-status" id="pk-mp-status">Connecting…</div>
    <div class="hud-spacer"></div>
    <div class="hud-actions" id="pk-mp-actions" style="display:none">
      <button class="hud-btn hud-btn-red" id="pk-mp-fold" style="display:none">Fold</button>
      <button class="hud-btn hud-btn-blue" id="pk-mp-call">Call $0</button>
      <button class="hud-btn hud-btn-green" id="pk-mp-raise">Raise +$${RAISE_AMOUNT}</button>
    </div>
    <div class="hud-players-panel" id="pk-mp-players" style="display:none">
      <div class="hud-players-title">Players</div>
      <div id="pk-mp-players-list"></div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  const potEl = hud.querySelector<HTMLDivElement>("#pk-mp-pot")!;
  const statusEl = hud.querySelector<HTMLDivElement>("#pk-mp-status")!;
  const actionsEl = hud.querySelector<HTMLDivElement>("#pk-mp-actions")!;
  const foldBtnEl = hud.querySelector<HTMLButtonElement>("#pk-mp-fold")!;
  const callBtnEl = hud.querySelector<HTMLButtonElement>("#pk-mp-call")!;
  const raiseBtnEl = hud.querySelector<HTMLButtonElement>("#pk-mp-raise")!;
  const playersPanel = hud.querySelector<HTMLDivElement>("#pk-mp-players")!;
  const playersListEl = hud.querySelector<HTMLDivElement>(
    "#pk-mp-players-list",
  )!;

  hud.querySelector("#pk-mp-back")!.addEventListener("click", async () => {
    await leaveRoom(roomId, userId);
    manager.goto("menu");
  });

  // ── Render ────────────────────────────────────────────────────────────────
  const render = (state: PokerMpState) => {
    gs = state;
    while (dynamicLayer.children.length > 0) dynamicLayer.removeChildAt(0);

    potEl.textContent = `Pot: $${state.pot}`;

    const myPlayer = state.players.find((p) => p.id === userId);
    const myTurn =
      state.phase !== "showdown" &&
      state.phase !== "round-over" &&
      state.active_player === userId &&
      !(myPlayer?.folded ?? true);

    // Community cards
    const COMM_Y = 100;
    const communityCount = state.community.length;
    if (communityCount > 0) {
      const commStartX =
        SCREEN_WIDTH / 2 - (communityCount * (CARD_WIDTH + 8)) / 2;
      state.community.forEach((card, i) => {
        const c = createCard(card);
        c.position.set(commStartX + i * (CARD_WIDTH + 8), COMM_Y);
        dynamicLayer.addChild(c);
      });
    } else {
      const waitT = new Text({
        text:
          state.phase === "pre-flop" ? "Waiting for flop…" : "Community cards",
        style: new TextStyle({ fontSize: 13, fill: "#666666" }),
      });
      waitT.anchor.set(0.5);
      waitT.position.set(SCREEN_WIDTH / 2, COMM_Y + CARD_HEIGHT / 2);
      dynamicLayer.addChild(waitT);
    }

    // Player slots
    const count = state.players.length;
    const SLOT_W = Math.floor((SCREEN_WIDTH - 40) / count);
    const SLOT_Y = 255;

    state.players.forEach((player, i) => {
      const slotX = 20 + i * SLOT_W;
      const isMe = player.id === userId;
      const isActive = state.active_player === player.id;
      const isFolded = player.folded;

      if (isActive && myTurn) {
        const hl = new Graphics();
        hl.roundRect(slotX, SLOT_Y - 4, SLOT_W - 4, 200, 8);
        hl.stroke({ color: 0xd4af37, width: 2 });
        dynamicLayer.addChild(hl);
      }

      if (isFolded) {
        const foldedBg = new Graphics();
        foldedBg.roundRect(slotX, SLOT_Y - 4, SLOT_W - 4, 200, 8);
        foldedBg.fill({ color: 0x000000, alpha: 0.4 });
        dynamicLayer.addChild(foldedBg);
      }

      const nameT = new Text({
        text: `${player.name}${isMe ? " (You)" : ""}`,
        style: new TextStyle({
          fontSize: 12,
          fontWeight: "bold",
          fill: isFolded ? "#555555" : isMe ? "#d4af37" : "#cccccc",
        }),
      });
      nameT.anchor.set(0.5, 0);
      nameT.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y);
      dynamicLayer.addChild(nameT);

      const balT = new Text({
        text: `$${player.balance}  bet $${player.bet_this_round}`,
        style: new TextStyle({
          fontSize: 11,
          fill: isFolded ? "#444444" : "#888888",
        }),
      });
      balT.anchor.set(0.5, 0);
      balT.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y + 16);
      dynamicLayer.addChild(balT);

      const showFaceUp =
        isMe || state.phase === "showdown" || state.phase === "round-over";
      player.hand.forEach((card, ci) => {
        const c = createCard(
          showFaceUp
            ? { ...card, isFaceUp: true }
            : { ...card, isFaceUp: false },
        );
        c.position.set(slotX + 4 + ci * (CARD_WIDTH + 6), SLOT_Y + 34);
        dynamicLayer.addChild(c);
      });

      if (isFolded) {
        const ft = new Text({
          text: "FOLDED",
          style: new TextStyle({
            fontSize: 13,
            fontWeight: "bold",
            fill: "#555555",
          }),
        });
        ft.anchor.set(0.5, 0);
        ft.position.set(slotX + SLOT_W / 2 - 2, SLOT_Y + 34 + CARD_HEIGHT + 4);
        dynamicLayer.addChild(ft);
      }

      if (
        (state.phase === "showdown" || state.phase === "round-over") &&
        !isFolded &&
        player.hand.length === 2
      ) {
        const hr = evaluateBestHand(player.hand, state.community);
        const handT = new Text({
          text: hr.label,
          style: new TextStyle({ fontSize: 11, fill: "#d4af37" }),
        });
        handT.anchor.set(0.5, 0);
        handT.position.set(
          slotX + SLOT_W / 2 - 2,
          SLOT_Y + 34 + CARD_HEIGHT + 4,
        );
        dynamicLayer.addChild(handT);
      }
    });

    // HUD: status
    const phaseLabels: Record<string, string> = {
      "pre-flop": "Pre-Flop",
      flop: "Flop",
      turn: "Turn",
      river: "River",
      showdown: "Showdown",
      "round-over": "Round Over",
    };
    if (myTurn) {
      statusEl.textContent = `${phaseLabels[state.phase]} — Your turn`;
    } else if (
      state.active_player &&
      state.phase !== "showdown" &&
      state.phase !== "round-over"
    ) {
      statusEl.textContent = `${phaseLabels[state.phase]} — Waiting for ${state.active_player}…`;
    } else {
      statusEl.textContent = phaseLabels[state.phase] ?? state.phase;
    }

    // HUD: action buttons
    const callAmount = Math.max(
      0,
      state.current_bet - (myPlayer?.bet_this_round ?? 0),
    );
    actionsEl.style.display = myTurn ? "flex" : "none";
    foldBtnEl.style.display = myTurn ? "" : "none";
    callBtnEl.textContent = callAmount === 0 ? "Check" : `Call $${callAmount}`;
    [foldBtnEl, callBtnEl, raiseBtnEl].forEach((b) => {
      b.disabled = false;
    });

    // Deal again (host)
    const existingDeal = actionsEl.querySelector("#pk-mp-deal-again");
    if (existingDeal) existingDeal.remove();
    if (state.phase === "round-over" && isHost) {
      actionsEl.style.display = "flex";
      const dealBtn = document.createElement("button");
      dealBtn.id = "pk-mp-deal-again";
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
        const isMe = p.id === userId;
        const cls = isActive ? "active" : isMe ? "me" : "";
        return `<div class="hud-player-row ${cls}">${p.name}${isMe ? " (You)" : ""}${p.folded ? " (F)" : ""} <span>$${p.balance}</span></div>`;
      })
      .join("");
  };

  // ── Host: game engine ────────────────────────────────────────────────────
  const nextActivePlayer = (
    state: PokerMpState,
    afterIdx: number,
  ): string | null => {
    const n = state.players.length;
    for (let i = 1; i <= n; i++) {
      const p = state.players[(afterIdx + i) % n];
      if (!p.folded) return p.id;
    }
    return null;
  };

  const isBettingRoundComplete = (state: PokerMpState): boolean => {
    const active = state.players.filter((p) => !p.folded);
    if (active.length <= 1) return true;
    return active.every(
      (p) => p.acted && p.bet_this_round === state.current_bet,
    );
  };

  const startBettingRound = (state: PokerMpState): void => {
    state.players.forEach((p) => {
      p.acted = false;
      p.bet_this_round = 0;
    });
    state.current_bet = 0;
    const dealerIdx = state.dealer_index % state.players.length;
    state.active_player = nextActivePlayer(state, dealerIdx);
  };

  const advancePhase = async (state: PokerMpState): Promise<boolean> => {
    const activePlayers = state.players.filter((p) => !p.folded);
    if (activePlayers.length <= 1) {
      activePlayers[0].balance += state.pot;
      state.phase = "round-over";
      await pushGameState(roomId, state);
      return true;
    }

    startBettingRound(state);

    switch (state.phase) {
      case "pre-flop":
        state.phase = "flop";
        state.community.push(
          { ...state.deck.shift()!, isFaceUp: true },
          { ...state.deck.shift()!, isFaceUp: true },
          { ...state.deck.shift()!, isFaceUp: true },
        );
        break;
      case "flop":
        state.phase = "turn";
        state.community.push({ ...state.deck.shift()!, isFaceUp: true });
        break;
      case "turn":
        state.phase = "river";
        state.community.push({ ...state.deck.shift()!, isFaceUp: true });
        break;
      case "river":
        await resolveShowdown(state);
        return true;
    }
    await pushGameState(roomId, state);
    return false;
  };

  const resolveShowdown = async (state: PokerMpState): Promise<void> => {
    state.phase = "showdown";
    state.players.forEach((p) => {
      p.hand = p.hand.map((c) => ({ ...c, isFaceUp: true }));
    });

    const active = state.players.filter((p) => !p.folded);
    if (active.length === 1) {
      active[0].balance += state.pot;
    } else {
      let bestRank = evaluateBestHand(active[0].hand, state.community);
      let winners: PokerMpPlayer[] = [active[0]];
      for (let i = 1; i < active.length; i++) {
        const hr = evaluateBestHand(active[i].hand, state.community);
        const cmp = comparePokerHands(hr, bestRank);
        if (cmp === "h1") {
          bestRank = hr;
          winners = [active[i]];
        } else if (cmp === "tie") {
          winners.push(active[i]);
        }
      }
      const share = Math.floor(state.pot / winners.length);
      winners.forEach((w) => {
        w.balance += share;
      });
    }

    await pushGameState(roomId, state);
    await new Promise((r) => setTimeout(r, 3000));
    state.phase = "round-over";
    await pushGameState(roomId, state);
  };

  let processing = false;
  const queue: PlayerAction[] = [];

  const drainQueue = async (): Promise<void> => {
    if (processing || queue.length === 0) return;
    processing = true;
    const action = queue.shift()!;

    const fresh = await fetchGameState<PokerMpState>(roomId);
    if (!fresh) {
      processing = false;
      void drainQueue();
      return;
    }
    const state: PokerMpState = JSON.parse(
      JSON.stringify(fresh),
    ) as PokerMpState;

    if (state.active_player !== action.player_id) {
      processing = false;
      void drainQueue();
      return;
    }

    const playerIdx = state.players.findIndex(
      (p) => p.id === action.player_id,
    );
    const player = state.players[playerIdx];
    if (!player || player.folded) {
      processing = false;
      void drainQueue();
      return;
    }

    const callAmount = Math.max(0, state.current_bet - player.bet_this_round);

    if (action.action_type === "fold") {
      player.folded = true;
      player.acted = true;
    } else if (action.action_type === "call") {
      const pay = Math.min(callAmount, player.balance);
      player.balance -= pay;
      player.bet_this_round += pay;
      state.pot += pay;
      player.acted = true;
    } else if (action.action_type === "raise") {
      const pay = Math.min(callAmount + RAISE_AMOUNT, player.balance);
      player.balance -= pay;
      player.bet_this_round += pay;
      state.pot += pay;
      state.current_bet = player.bet_this_round;
      state.players.forEach((p, i) => {
        if (i !== playerIdx && !p.folded) p.acted = false;
      });
      player.acted = true;
    }

    if (isBettingRoundComplete(state)) {
      processing = false;
      await advancePhase(state);
    } else {
      state.active_player = nextActivePlayer(state, playerIdx);
      await pushGameState(roomId, state);
      processing = false;
    }

    void drainQueue();
  };

  const startNewRound = async (prevPlayers: PokerMpPlayer[]): Promise<void> => {
    const deck = shuffleDeck(createDeck());
    const dealerIdx = (gs?.dealer_index ?? 0) + 1;
    const state: PokerMpState = {
      phase: "pre-flop",
      deck,
      community: [],
      pot: 0,
      current_bet: 0,
      dealer_index: dealerIdx,
      players: prevPlayers.map((p) => ({
        ...p,
        hand: [],
        bet_this_round: 0,
        folded: false,
        acted: false,
      })),
      active_player: null,
    };
    state.players.forEach((p) => {
      p.hand = [
        { ...state.deck.shift()!, isFaceUp: true },
        { ...state.deck.shift()!, isFaceUp: true },
      ];
      const ante = Math.min(ANTE, p.balance);
      p.balance -= ante;
      p.bet_this_round += ante;
      state.pot += ante;
    });
    state.current_bet = ANTE;
    const startIdx = dealerIdx % state.players.length;
    state.active_player = nextActivePlayer(state, startIdx);
    await pushGameState(roomId, state);
  };

  const initGame = async (): Promise<void> => {
    const roomPlayers = await getRoomPlayers(roomId);
    const deck = shuffleDeck(createDeck());
    const state: PokerMpState = {
      phase: "pre-flop",
      deck,
      community: [],
      pot: 0,
      current_bet: 0,
      dealer_index: 0,
      players: roomPlayers.map((p) => ({
        id: p.player_id,
        name: p.display_name,
        hand: [],
        balance: p.balance,
        bet_this_round: 0,
        folded: false,
        acted: false,
      })),
      active_player: null,
    };
    state.players.forEach((p) => {
      p.hand = [
        { ...state.deck.shift()!, isFaceUp: true },
        { ...state.deck.shift()!, isFaceUp: true },
      ];
      const ante = Math.min(ANTE, p.balance);
      p.balance -= ante;
      p.bet_this_round += ante;
      state.pot += ante;
    });
    state.current_bet = ANTE;
    state.active_player = nextActivePlayer(state, 0);
    await pushGameState(roomId, state);
  };

  // ── Wire buttons ─────────────────────────────────────────────────────────
  foldBtnEl.addEventListener("click", () => {
    [foldBtnEl, callBtnEl, raiseBtnEl].forEach((b) => {
      b.disabled = true;
    });
    void submitAction(roomId, userId, "fold");
  });
  callBtnEl.addEventListener("click", () => {
    [foldBtnEl, callBtnEl, raiseBtnEl].forEach((b) => {
      b.disabled = true;
    });
    void submitAction(roomId, userId, "call");
  });
  raiseBtnEl.addEventListener("click", () => {
    [foldBtnEl, callBtnEl, raiseBtnEl].forEach((b) => {
      b.disabled = true;
    });
    void submitAction(roomId, userId, "raise");
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
    void fetchGameState<PokerMpState>(roomId).then((s) => {
      if (s) render(s);
    });
    cleanups.push(
      subscribeToRoomDeletion(roomId, () => {
        statusEl.textContent = "Host disconnected. Returning to menu…";
        setTimeout(() => manager.goto("menu"), 2000);
      }),
    );
  }

  cleanups.push(subscribeToGameState<PokerMpState>(roomId, render));

  root.__teardown = () => {
    cleanups.forEach((c) => c());
    hud.remove();
  };
  return root;
};
