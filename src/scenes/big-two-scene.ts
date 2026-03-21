import { Assets, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { SceneContainer } from "../systems/scene-manager";
import type { SceneManager } from "../systems/scene-manager";
import { createCard } from "../entities/card";
import { CARD_HEIGHT, CARD_WIDTH, SCREEN_HEIGHT, SCREEN_WIDTH } from "../utils/constants";
import type { CardData, SceneParams } from "../types";
import {
  type BigTwoCombo,
  aiPickPlay,
  canBeat,
  comboLabel,
  createBigTwoDeck,
  dealCards,
  detectCombo,
  findThreeOfSpadesOwner,
  findStartingCard,
  isValidFirstPlay,
  sortHand,
} from "../systems/big-two-logic";

// ── Pixel-art helpers ─────────────────────────────────────────────────────────
const C_PANEL = 0x0c0c20;
const C_BORDER = 0x252548;
const C_GOLD = 0xd4af37;
const C_MUTED = 0x555577;

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

function slotAddText(
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

// Player seat layout: 0=human(bottom) 1=left 2=top 3=right
interface BTPlayer {
  name: string;
  hand: CardData[];
  isHuman: boolean;
}

const PLAYER_POSITIONS = [
  { x: SCREEN_WIDTH / 2, y: 515 }, // bottom (human) — matches MP HAND_Y
  { x: 115, y: 335 },              // left AI
  { x: SCREEN_WIDTH / 2, y: 100 }, // top AI
  { x: 1165, y: 335 },             // right AI
];

// Pixel-art slot panels (name/count/status panels for each player)
const SLOT_PANELS = [
  { x: 450, y: 635, w: 380, h: 52 }, // human bottom
  { x: 4,   y: 245, w: 180, h: 80 }, // left (West)
  { x: 460, y: 8,   w: 360, h: 80 }, // top (North)
  { x: 1096,y: 245, w: 180, h: 80 }, // right (East)
];

// Log constants
const LOG_X = 8;
const LOG_Y = 110;
const LOG_W = 270;
const LOG_LINE_H = 18;
const LOG_PAD = 8;
const LOG_MAX_LINES = 9;

export const createBigTwoScene = (
  manager: SceneManager,
  params: SceneParams = {},
): SceneContainer => {
  void params;
  const root = new Container() as SceneContainer;
  root.label = "big-two-scene";

  // ── State ──────────────────────────────────────────────────────────────────
  const players: BTPlayer[] = [
    { name: "You", hand: [], isHuman: true },
    { name: "West", hand: [], isHuman: false },
    { name: "North", hand: [], isHuman: false },
    { name: "East", hand: [], isHuman: false },
  ];

  let currentPlayerIdx = 0;
  let currentCombo: BigTwoCombo | null = null;
  let lastPlayedBy = 0;
  const passedInRound = new Set<number>();
  let isFirstMove = true;
  let startCard: CardData = { rank: "3", suit: "spades", isFaceUp: true };
  let gameOver = false;
  const selectedIndices = new Set<number>();
  const finishOrder: number[] = [];
  const thoiHaiPlayers: number[] = [];
  const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  function addTimeout(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    pendingTimeouts.push(id);
  }

  function clearLayer(layer: Container) {
    while (layer.children.length > 0) layer.removeChildAt(0);
  }

  // ── PixiJS layers ──────────────────────────────────────────────────────────
  const bg = new Graphics(Assets.get("assets/bg/bg.svg"));
  bg.scale.set(SCREEN_WIDTH / 1920);
  root.addChild(bg);

  const slotsLayer = new Container();
  const centerContainer = new Container();
  centerContainer.position.set(SCREEN_WIDTH / 2, 310);

  const humanHandContainer = new Container();
  humanHandContainer.position.set(0, PLAYER_POSITIONS[0].y);

  // Glow animation
  let glowAlpha = 0.5;
  let glowDir = 1;
  const glowGraphics = new Graphics();
  const glowInterval = setInterval(() => {
    glowAlpha = Math.max(0.1, Math.min(0.95, glowAlpha + glowDir * 0.035));
    if (glowAlpha >= 0.95) glowDir = -1;
    if (glowAlpha <= 0.1) glowDir = 1;
    glowGraphics.alpha = glowAlpha;
  }, 16);

  const logLayer = new Container();

  root.addChild(slotsLayer, centerContainer, humanHandContainer, glowGraphics, logLayer);

  // Status text (centered, same as MP)
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

  // ── Play log ───────────────────────────────────────────────────────────────
  const playLog: string[] = [];

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
      .stroke({ color: C_BORDER, width: 1 });
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

  // ── HTML HUD ───────────────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="tl-back">← Menu</button>
      <div style="width:90px"></div>
    </div>
    <div class="hud-spacer"></div>
    <div style="text-align:center;font-size:13px;color:#f87171;padding:0 14px 4px;pointer-events:none" id="tl-hint"></div>
    <div class="hud-actions" id="tl-actions">
      <button class="hud-btn hud-btn-green" id="tl-play" disabled>Play</button>
      <button class="hud-btn hud-btn-red" id="tl-pass" disabled>Pass</button>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  const hintEl = hud.querySelector<HTMLDivElement>("#tl-hint")!;
  const playBtnEl = hud.querySelector<HTMLButtonElement>("#tl-play")!;
  const passBtnEl = hud.querySelector<HTMLButtonElement>("#tl-pass")!;

  hud
    .querySelector("#tl-back")!
    .addEventListener("click", () => manager.goto("menu"));

  // ── Render helpers ─────────────────────────────────────────────────────────

  function renderHumanHand() {
    humanHandContainer.removeChildren();
    const hand = players[0].hand;
    if (hand.length === 0) return;

    const GAP = Math.min(32, (SCREEN_WIDTH - 120) / Math.max(hand.length, 1));
    const totalW = (hand.length - 1) * GAP + CARD_WIDTH;
    const startX = SCREEN_WIDTH / 2 - totalW / 2;

    hand.forEach((cardData, i) => {
      const sprite = createCard({ ...cardData, isFaceUp: true });
      sprite.x = startX + i * GAP;
      sprite.y = selectedIndices.has(i) ? -28 : 0;

      if (selectedIndices.has(i)) {
        const glow = new Graphics();
        glow
          .roundRect(-3, -3, CARD_WIDTH + 6, CARD_HEIGHT + 6, 7)
          .fill({ color: 0xffd700, alpha: 0.25 });
        sprite.addChildAt(glow, 0);
      }

      if (!gameOver && currentPlayerIdx === 0) {
        sprite.eventMode = "static";
        sprite.cursor = "pointer";
        sprite.on("pointerdown", () => {
          if (selectedIndices.has(i)) selectedIndices.delete(i);
          else selectedIndices.add(i);
          hintEl.textContent = "";
          renderHumanHand();
        });
      }

      humanHandContainer.addChild(sprite);
    });
  }


  function renderCenter() {
    centerContainer.removeChildren();

    if (!currentCombo) {
      const outline = new Graphics();
      outline.roundRect(-110, -36, 220, 72, 10).stroke({ color: C_MUTED, width: 1 });
      centerContainer.addChild(outline);
      const placeholder = new Text({
        text: "Lead the round",
        style: new TextStyle({ fontSize: 15, fill: "#668866", fontFamily: "monospace" }),
      });
      placeholder.anchor.set(0.5);
      centerContainer.addChild(placeholder);
      return;
    }

    const cards = currentCombo.cards;
    const GAP = Math.min(24, 560 / Math.max(cards.length, 1));
    const totalW = (cards.length - 1) * GAP + CARD_WIDTH;
    const startX = -totalW / 2;
    cards.forEach((cardData, i) => {
      const sprite = createCard({ ...cardData, isFaceUp: true });
      sprite.x = startX + i * GAP;
      sprite.y = -56;
      centerContainer.addChild(sprite);
    });
  }

  function renderPlayerSlots() {
    clearLayer(slotsLayer);
    glowGraphics.clear();

    SLOT_PANELS.forEach((slot, i) => {
      const player = players[i];
      const isActive = i === currentPlayerIdx && !gameOver;
      const place = finishOrder.indexOf(i);

      const g = new Graphics();
      pixelPanel(g, slot.x, slot.y, slot.w, slot.h, isActive);

      // Avatar (40×40)
      const col = playerInitialsColor(player.name);
      g.rect(slot.x + 6, slot.y + 6, 40, 40).fill(0x080820);
      g.rect(slot.x + 6, slot.y + 6, 40, 40).stroke({ color: col, width: 1 });
      slotsLayer.addChild(g);

      const initials = player.name.slice(0, 2).toUpperCase();
      slotAddText(
        slotsLayer,
        initials,
        slot.x + 14,
        slot.y + 14,
        13,
        `#${col.toString(16).padStart(6, "0")}`,
        true,
      );

      // Name
      const displayName =
        player.name.length > 11 ? player.name.slice(0, 10) + "…" : player.name;
      const nameLabel = i === 0 ? displayName + " (You)" : displayName;
      slotAddText(
        slotsLayer,
        nameLabel,
        slot.x + 54,
        slot.y + 7,
        10,
        isActive ? "#ffd700" : "#ccccee",
        true,
      );

      // Status / card count
      let statusStr: string;
      let statusColor: string;
      if (place >= 0) {
        statusStr = placeLabel(place + 1);
        statusColor = place === 0 ? "#ffd700" : "#aaaadd";
      } else {
        const cnt = player.hand.length;
        statusStr = isActive
          ? i === 0
            ? "▶ YOUR TURN"
            : "▶ TURN"
          : `${cnt} card${cnt !== 1 ? "s" : ""}`;
        statusColor = isActive ? "#ffd700" : "#aaddaa";
      }
      slotAddText(slotsLayer, statusStr, slot.x + 54, slot.y + 26, 9, statusColor, isActive);

      // Card mini-bars
      if (place < 0 && player.hand.length > 0) {
        const cnt = player.hand.length;
        for (let j = 0; j < Math.min(cnt, 8); j++) {
          const bar = new Graphics();
          bar.rect(slot.x + 7 + j * 7, slot.y + slot.h - 12, 6, 8).fill(0x1a1a6a);
          slotsLayer.addChild(bar);
        }
      }

      // Glow for active player
      if (isActive) {
        glowGraphics
          .rect(slot.x - 4, slot.y - 4, slot.w + 8, slot.h + 8)
          .stroke({ color: C_GOLD, width: 3 });
        glowGraphics
          .rect(slot.x - 7, slot.y - 7, slot.w + 14, slot.h + 14)
          .stroke({ color: C_GOLD, width: 1 });
      }
    });
  }

  function updateHudButtons() {
    const isHumanTurn = currentPlayerIdx === 0 && !gameOver;
    playBtnEl.disabled = !isHumanTurn;
    passBtnEl.disabled = !isHumanTurn || !currentCombo;
  }

  function updateHudStatus() {
    if (gameOver) {
      statusText.text = "";
      return;
    }
    const name = players[currentPlayerIdx].name;
    statusText.text = currentCombo
      ? `${name}'s turn — beat the ${currentCombo.type}`
      : `${name}'s turn — lead the round`;
  }

  function renderAll() {
    renderHumanHand();
    renderCenter();
    renderPlayerSlots();
    updateHudButtons();
    updateHudStatus();
  }

  // ── Game flow ──────────────────────────────────────────────────────────────

  function dealAndStart(forcedFirstPlayer?: number) {
    const deck = createBigTwoDeck();
    const hands = dealCards(deck, 4);
    for (let i = 0; i < 4; i++) {
      players[i].hand = sortHand(hands[i]);
    }
    startCard = findStartingCard(hands);
    if (forcedFirstPlayer !== undefined) {
      currentPlayerIdx = forcedFirstPlayer;
      isFirstMove = false;
    } else {
      currentPlayerIdx = findThreeOfSpadesOwner(hands);
      isFirstMove = true;
    }
    currentCombo = null;
    passedInRound.clear();
    selectedIndices.clear();
    finishOrder.length = 0;
    thoiHaiPlayers.length = 0;
    gameOver = false;

    renderAll();
    const starterName = players[currentPlayerIdx].name;
    addToLog(
      forcedFirstPlayer !== undefined
        ? `${starterName} starts (last winner)`
        : startCard.rank === "3" && startCard.suit === "spades"
          ? `${starterName} starts (has ♠3)`
          : `${starterName} starts (lowest card)`,
    );
    beginTurn();
  }

  function beginTurn() {
    if (gameOver) return;
    updateHudButtons();
    updateHudStatus();
    renderPlayerSlots();
    if (currentPlayerIdx !== 0) {
      addTimeout(doAITurn, 1300);
    }
  }

  function doAITurn() {
    if (gameOver) return;
    const player = players[currentPlayerIdx];
    const combo = aiPickPlay(player.hand, currentCombo, isFirstMove, startCard);
    if (combo) {
      executePlay(combo);
    } else {
      executePass();
    }
  }

  function executePlay(combo: BigTwoCombo) {
    const pIdx = currentPlayerIdx;
    const player = players[pIdx];

    const played = new Set(combo.cards);
    player.hand = player.hand.filter((c) => !played.has(c));

    currentCombo = combo;
    lastPlayedBy = pIdx;
    passedInRound.clear();
    isFirstMove = false;

    if (player.hand.length === 0) {
      if (combo.cards.some((c) => c.rank === "2")) {
        thoiHaiPlayers.push(pIdx);
        addToLog(`${player.name} THỚI 2 — goes last!`);
      } else {
        finishOrder.push(pIdx);
        addToLog(`${player.name} finished ${placeLabel(finishOrder.length)}!`);
      }

      const remaining = players.filter((p) => p.hand.length > 0).length;
      renderAll();

      if (remaining <= 1) {
        const loserIdx = players.findIndex(
          (p) => p.hand.length > 0 && !finishOrder.includes(players.indexOf(p)),
        );
        if (loserIdx >= 0) finishOrder.push(loserIdx);
        addTimeout(() => showGameEnd(), 900);
        return;
      }

      addTimeout(() => {
        startNewRoundAfterFinish(pIdx);
      }, 1600);
      return;
    }

    addToLog(`${player.name} played ${comboLabel(combo)}`);
    renderAll();
    advanceTurn();
  }

  function executePass() {
    const pIdx = currentPlayerIdx;
    passedInRound.add(pIdx);
    addToLog(`${players[pIdx].name} passed`);
    advanceTurn();
  }

  function advanceTurn() {
    let next = (currentPlayerIdx + 1) % 4;
    let steps = 0;
    while (players[next].hand.length === 0 && steps < 4) {
      next = (next + 1) % 4;
      steps++;
    }
    currentPlayerIdx = next;

    if (shouldResetRound()) {
      startNewRound();
      return;
    }

    renderAll();
    beginTurn();
  }

  function shouldResetRound(): boolean {
    const others = players
      .map((_p, i) => i)
      .filter((i) => i !== lastPlayedBy && players[i].hand.length > 0);
    return others.length > 0 && others.every((i) => passedInRound.has(i));
  }

  function startNewRound() {
    currentPlayerIdx = lastPlayedBy;
    currentCombo = null;
    passedInRound.clear();
    selectedIndices.clear();
    addToLog(`${players[lastPlayedBy].name} wins the round!`);
    renderAll();
    addTimeout(() => beginTurn(), 1600);
  }

  function startNewRoundAfterFinish(finishedIdx: number) {
    currentCombo = null;
    passedInRound.clear();
    selectedIndices.clear();

    let next = (finishedIdx + 1) % 4;
    let steps = 0;
    while (players[next].hand.length === 0 && steps < 4) {
      next = (next + 1) % 4;
      steps++;
    }
    currentPlayerIdx = next;
    lastPlayedBy = next;

    renderAll();
    beginTurn();
  }

  function placeLabel(place: number): string {
    return ["🥇 1st", "🥈 2nd", "🥉 3rd", "💀 Last"][place - 1] ?? `${place}th`;
  }

  function showGameEnd() {
    for (const pIdx of thoiHaiPlayers) {
      if (!finishOrder.includes(pIdx)) finishOrder.push(pIdx);
    }
    gameOver = true;
    renderAll();

    const overlay = new Graphics();
    overlay.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill({ color: 0x000000, alpha: 0.78 });
    root.addChild(overlay);

    const titleEl = new Text({
      text: "GAME RESULTS",
      style: new TextStyle({
        fontSize: 42,
        fontWeight: "bold",
        fill: "#d4af37",
        fontFamily: "Georgia, serif",
      }),
    });
    titleEl.anchor.set(0.5);
    titleEl.position.set(SCREEN_WIDTH / 2, 190);
    root.addChild(titleEl);

    const rowColors = ["#ffd700", "#c0c0c0", "#cd7f32", "#ff5555"];
    const rowBg = [0x3a3000, 0x2a2a2a, 0x2a1a00, 0x3a0000];
    finishOrder.forEach((pIdx, rank) => {
      const y = 260 + rank * 70;
      const bg2 = new Graphics();
      bg2
        .roundRect(SCREEN_WIDTH / 2 - 280, y - 24, 560, 52, 8)
        .fill({ color: rowBg[rank], alpha: 0.9 });
      root.addChild(bg2);

      const rankText = new Text({
        text: placeLabel(rank + 1),
        style: new TextStyle({ fontSize: 22, fontWeight: "bold", fill: rowColors[rank] }),
      });
      rankText.anchor.set(0, 0.5);
      rankText.position.set(SCREEN_WIDTH / 2 - 260, y);
      root.addChild(rankText);

      const nameEl = new Text({
        text: players[pIdx].name,
        style: new TextStyle({ fontSize: 22, fill: "#ffffff" }),
      });
      nameEl.anchor.set(0, 0.5);
      nameEl.position.set(SCREEN_WIDTH / 2 - 60, y);
      root.addChild(nameEl);

      if (thoiHaiPlayers.includes(pIdx)) {
        const pen = new Text({
          text: "💀 Thới 2 penalty!",
          style: new TextStyle({ fontSize: 14, fill: "#ff4444" }),
        });
        pen.anchor.set(1, 0.5);
        pen.position.set(SCREEN_WIDTH / 2 + 260, y);
        root.addChild(pen);
      } else if (rank === finishOrder.length - 1 && !thoiHaiPlayers.includes(pIdx)) {
        const hand = players[pIdx].hand;
        const penaltyText =
          hand.length === 2
            ? "💀 Double Penalty! (2 cards left)"
            : hand.some((c) => c.rank === "2")
              ? "⚠ holds a 2"
              : null;
        if (penaltyText) {
          const pen = new Text({
            text: penaltyText,
            style: new TextStyle({
              fontSize: 14,
              fill: hand.length === 2 ? "#ff4444" : "#ff9944",
            }),
          });
          pen.anchor.set(1, 0.5);
          pen.position.set(SCREEN_WIDTH / 2 + 260, y);
          root.addChild(pen);
        }
      }
    });

    const fixedChildCount = root.children.length;

    hud.querySelector("#tl-actions")!.innerHTML = `
      <button class="hud-btn hud-btn-green" id="tl-again">Play Again</button>
      <button class="hud-btn hud-btn-grey" id="tl-menu">Main Menu</button>
    `;
    hud.querySelector("#tl-again")!.addEventListener("click", () => {
      const lastWinner = finishOrder[0];
      while (root.children.length > fixedChildCount) {
        root.removeChildAt(root.children.length - 1);
      }
      hud.querySelector("#tl-actions")!.innerHTML = `
        <button class="hud-btn hud-btn-green" id="tl-play" disabled>Play</button>
        <button class="hud-btn hud-btn-red" id="tl-pass" disabled>Pass</button>
      `;
      rewireButtons();
      dealAndStart(lastWinner);
    });
    hud
      .querySelector("#tl-menu")!
      .addEventListener("click", () => manager.goto("menu"));
  }

  // ── Button callbacks ───────────────────────────────────────────────────────

  function rewireButtons() {
    const pb = hud.querySelector<HTMLButtonElement>("#tl-play");
    const psb = hud.querySelector<HTMLButtonElement>("#tl-pass");
    if (pb) pb.addEventListener("click", onPlay);
    if (psb) psb.addEventListener("click", onPass);
  }

  function onPlay() {
    if (gameOver || currentPlayerIdx !== 0) return;
    if (selectedIndices.size === 0) {
      hintEl.textContent = "Select cards to play!";
      return;
    }

    const chosen = [...selectedIndices].map((i) => players[0].hand[i]);
    const combo = detectCombo(chosen);

    if (!combo) {
      hintEl.textContent = "That's not a valid combination!";
      return;
    }
    if (isFirstMove && !isValidFirstPlay(combo, startCard)) {
      const label =
        startCard.rank === "3" && startCard.suit === "spades"
          ? "♠3"
          : `${startCard.rank}${{ hearts: "♥", diamonds: "♦", clubs: "♣", spades: "♠" }[startCard.suit]}`;
      hintEl.textContent = `First play must include the ${label}!`;
      return;
    }
    if (currentCombo && !canBeat(combo, currentCombo)) {
      hintEl.textContent = `Can't beat the current ${currentCombo.type}!`;
      return;
    }

    hintEl.textContent = "";
    selectedIndices.clear();
    executePlay(combo);
  }

  function onPass() {
    if (gameOver || currentPlayerIdx !== 0) return;
    if (!currentCombo) {
      hintEl.textContent = "You must play a card to lead the round!";
      return;
    }
    hintEl.textContent = "";
    selectedIndices.clear();
    executePass();
  }

  rewireButtons();
  dealAndStart();

  root.__teardown = () => {
    pendingTimeouts.forEach(clearTimeout);
    clearInterval(glowInterval);
    hud.remove();
  };

  return root;
};
