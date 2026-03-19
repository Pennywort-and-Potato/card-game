import { Container, Graphics, Text, TextStyle } from "pixi.js";
import type { SceneContainer } from "../systems/scene-manager";
import type { SceneManager } from "../systems/scene-manager";
import { createCard } from "../entities/card";
import { createTableBackground } from "../utils/mock-graphics";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "../utils/constants";
import type { CardData, SceneParams } from "../types";
import {
  type TienLenCombo,
  aiPickPlay,
  canBeat,
  comboLabel,
  createTienLenDeck,
  dealCards,
  detectCombo,
  findThreeOfClubsOwner,
  isValidFirstPlay,
  sortHand,
} from "../systems/tienlen-logic";

// Player seat layout: 0=human(bottom) 1=left 2=top 3=right
interface TLPlayer {
  name: string;
  hand: CardData[];
  isHuman: boolean;
}

const PLAYER_POSITIONS = [
  { x: SCREEN_WIDTH / 2, y: 590 }, // bottom (human)
  { x: 115, y: 335 }, // left AI
  { x: SCREEN_WIDTH / 2, y: 50 }, // top AI
  { x: 1165, y: 335 }, // right AI
];

const NAME_OFFSETS = [
  { dx: 0, dy: -30 }, // human: label above hand
  { dx: 0, dy: 130 }, // left: label below stack
  { dx: 0, dy: 125 }, // top: label below spread
  { dx: 0, dy: 130 }, // right: label below stack
];

export const createTienLenScene = (
  manager: SceneManager,
  params: SceneParams = {},
): SceneContainer => {
  void params;
  const root = new Container() as SceneContainer;
  root.label = "tienlen-scene";

  // ── State ──────────────────────────────────────────────────────────────────
  const players: TLPlayer[] = [
    { name: "You", hand: [], isHuman: true },
    { name: "West", hand: [], isHuman: false },
    { name: "North", hand: [], isHuman: false },
    { name: "East", hand: [], isHuman: false },
  ];

  let currentPlayerIdx = 0;
  let currentCombo: TienLenCombo | null = null;
  let lastPlayedBy = 0;
  const passedInRound = new Set<number>();
  let isFirstMove = true;
  let gameOver = false;
  const selectedIndices = new Set<number>();
  const finishOrder: number[] = [];
  const pendingTimeouts: ReturnType<typeof setTimeout>[] = [];

  function addTimeout(fn: () => void, ms: number) {
    const id = setTimeout(fn, ms);
    pendingTimeouts.push(id);
  }

  // ── PixiJS fixed UI ─────────────────────────────────────────────────────────
  const bg = new Graphics();
  bg.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0x0a1f10);
  root.addChild(bg);
  root.addChild(createTableBackground());

  const titleText = new Text({
    text: "TIẾN LÊN MIỀN NAM",
    style: new TextStyle({
      fontSize: 22,
      fill: "#d4af37",
      fontWeight: "bold",
      fontFamily: "Georgia, serif",
    }),
  });
  titleText.anchor.set(0.5, 0);
  titleText.position.set(SCREEN_WIDTH / 2, 8);
  root.addChild(titleText);

  const msgText = new Text({
    text: "",
    style: new TextStyle({ fontSize: 16, fill: "#ffdd55" }),
  });
  msgText.anchor.set(0.5);
  msgText.position.set(SCREEN_WIDTH / 2, 440);
  root.addChild(msgText);

  const centerContainer = new Container();
  centerContainer.position.set(SCREEN_WIDTH / 2, 310);
  root.addChild(centerContainer);

  const playerAreaContainers: Container[] = players.map(() => new Container());
  players.forEach((_, i) => {
    playerAreaContainers[i].position.set(
      PLAYER_POSITIONS[i].x,
      PLAYER_POSITIONS[i].y,
    );
    root.addChild(playerAreaContainers[i]);
  });

  const humanHandContainer = new Container();
  humanHandContainer.position.set(0, PLAYER_POSITIONS[0].y);
  root.addChild(humanHandContainer);

  const turnIndicators: Graphics[] = players.map((_, i) => {
    const g = new Graphics();
    const pos = PLAYER_POSITIONS[i];
    const name_off = NAME_OFFSETS[i];
    g.circle(pos.x + name_off.dx, pos.y + name_off.dy + 8, 50).stroke({
      color: 0xffd700,
      width: 3,
      alpha: 0.85,
    });
    g.visible = false;
    root.addChild(g);
    return g;
  });

  // ── HTML HUD overlay ─────────────────────────────────────────────────────
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="tl-back">← Menu</button>
      <span class="hud-title">TIẾN LÊN MIỀN NAM</span>
      <div style="width:90px"></div>
    </div>
    <div class="hud-status" id="tl-status"></div>
    <div class="hud-spacer"></div>
    <div style="text-align:center;font-size:13px;color:#f87171;padding:0 14px 4px;pointer-events:none" id="tl-hint"></div>
    <div class="hud-actions" id="tl-actions">
      <button class="hud-btn hud-btn-green" id="tl-play" disabled>Play</button>
      <button class="hud-btn hud-btn-red" id="tl-pass" disabled>Pass</button>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  const statusEl = hud.querySelector<HTMLDivElement>("#tl-status")!;
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
    const totalW = (hand.length - 1) * GAP + 80;
    const startX = SCREEN_WIDTH / 2 - totalW / 2;

    hand.forEach((cardData, i) => {
      const sprite = createCard({ ...cardData, isFaceUp: true });
      sprite.x = startX + i * GAP;
      sprite.y = selectedIndices.has(i) ? -28 : 0;

      if (selectedIndices.has(i)) {
        const glow = new Graphics();
        glow
          .roundRect(-3, -3, 86, 118, 7)
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

  function renderAIHand(playerIdx: number) {
    const container = playerAreaContainers[playerIdx];
    container.removeChildren();
    const count = players[playerIdx].hand.length;
    const pos = PLAYER_POSITIONS[playerIdx];
    const nameOff = NAME_OFFSETS[playerIdx];

    if (playerIdx === 2) {
      const GAP = Math.min(20, 600 / Math.max(count, 1));
      const totalW = (count - 1) * GAP + 80;
      const startX = -totalW / 2;
      for (let i = 0; i < count; i++) {
        const sprite = createCard({
          rank: "3",
          suit: "spades",
          isFaceUp: false,
        });
        sprite.x = startX + i * GAP;
        sprite.y = 0;
        container.addChild(sprite);
      }
    } else {
      const show = Math.min(5, count);
      for (let i = 0; i < show; i++) {
        const sprite = createCard({
          rank: "3",
          suit: "spades",
          isFaceUp: false,
        });
        sprite.x = i * 4 - (show * 4) / 2;
        sprite.y = i * 4;
        container.addChild(sprite);
      }
    }

    const place = finishOrder.indexOf(playerIdx);
    const nameLabel = new Text({
      text:
        place >= 0
          ? `${players[playerIdx].name}  ${placeLabel(place + 1)}`
          : players[playerIdx].name,
      style: new TextStyle({
        fontSize: 15,
        fill: place === 0 ? "#ffd700" : place > 0 ? "#aaaaff" : "#ffffff",
        fontWeight: "bold",
      }),
    });
    nameLabel.anchor.set(0.5, 0);
    nameLabel.position.set(nameOff.dx, nameOff.dy);
    container.addChild(nameLabel);

    if (place < 0) {
      const countLabel = new Text({
        text: `${count} card${count !== 1 ? "s" : ""}`,
        style: new TextStyle({ fontSize: 13, fill: "#aaddaa" }),
      });
      countLabel.anchor.set(0.5, 0);
      countLabel.position.set(nameOff.dx, nameOff.dy + 18);
      container.addChild(countLabel);
    }

    turnIndicators[playerIdx].position.set(
      pos.x + nameOff.dx,
      pos.y + nameOff.dy + 8,
    );
  }

  function renderCenter() {
    centerContainer.removeChildren();

    if (!currentCombo) {
      const bg2 = new Graphics();
      bg2
        .roundRect(-110, -36, 220, 72, 10)
        .stroke({ color: 0x557755, width: 1 });
      centerContainer.addChild(bg2);
      const placeholder = new Text({
        text: "Lead the round",
        style: new TextStyle({ fontSize: 15, fill: "#668866" }),
      });
      placeholder.anchor.set(0.5);
      centerContainer.addChild(placeholder);
      return;
    }

    const cards = currentCombo.cards;
    const GAP = Math.min(24, 560 / Math.max(cards.length, 1));
    const totalW = (cards.length - 1) * GAP + 80;
    const startX = -totalW / 2;
    cards.forEach((cardData, i) => {
      const sprite = createCard({ ...cardData, isFaceUp: true });
      sprite.x = startX + i * GAP;
      sprite.y = -56;
      centerContainer.addChild(sprite);
    });

    const playedByLabel = new Text({
      text: `${players[lastPlayedBy].name}: ${comboLabel(currentCombo)}`,
      style: new TextStyle({ fontSize: 13, fill: "#cccccc" }),
    });
    playedByLabel.anchor.set(0.5, 0);
    playedByLabel.y = 62;
    centerContainer.addChild(playedByLabel);
  }

  function renderHumanArea() {
    const container = playerAreaContainers[0];
    container.removeChildren();
    const count = players[0].hand.length;
    const place = finishOrder.indexOf(0);
    const nameLabel = new Text({
      text: place >= 0 ? `You  ${placeLabel(place + 1)}` : "You",
      style: new TextStyle({
        fontSize: 15,
        fill: place === 0 ? "#ffd700" : place > 0 ? "#aaaaff" : "#ffffff",
        fontWeight: "bold",
      }),
    });
    nameLabel.anchor.set(0.5, 0);
    nameLabel.position.set(NAME_OFFSETS[0].dx, NAME_OFFSETS[0].dy);
    container.addChild(nameLabel);

    if (place < 0) {
      const countLabel = new Text({
        text: `${count} card${count !== 1 ? "s" : ""}`,
        style: new TextStyle({ fontSize: 13, fill: "#aaddaa" }),
      });
      countLabel.anchor.set(0.5, 0);
      countLabel.position.set(NAME_OFFSETS[0].dx, NAME_OFFSETS[0].dy + 18);
      container.addChild(countLabel);

      if (currentPlayerIdx === 0 && !gameOver) {
        const hint = new Text({
          text: isFirstMove
            ? "First move must include 3♣"
            : "Select cards, then Play",
          style: new TextStyle({ fontSize: 12, fill: "#88aa88" }),
        });
        hint.anchor.set(0.5, 0);
        hint.position.set(NAME_OFFSETS[0].dx, NAME_OFFSETS[0].dy + 36);
        container.addChild(hint);
      }
    }
  }

  function updateTurnIndicators() {
    for (let i = 0; i < 4; i++) {
      turnIndicators[i].visible = i === currentPlayerIdx && !gameOver;
    }
  }

  function updateHudButtons() {
    const isHumanTurn = currentPlayerIdx === 0 && !gameOver;
    playBtnEl.disabled = !isHumanTurn;
    passBtnEl.disabled = !isHumanTurn || !currentCombo;
  }

  function updateHudStatus() {
    if (gameOver) {
      statusEl.textContent = "";
      return;
    }
    const name = players[currentPlayerIdx].name;
    if (currentCombo) {
      statusEl.textContent = `${name}'s turn — beat the ${currentCombo.type}`;
    } else {
      statusEl.textContent = `${name}'s turn — lead the round`;
    }
  }

  function renderAll() {
    renderHumanHand();
    renderHumanArea();
    for (let i = 1; i <= 3; i++) renderAIHand(i);
    renderCenter();
    updateTurnIndicators();
    updateHudButtons();
    updateHudStatus();
  }

  // ── Game flow ──────────────────────────────────────────────────────────────

  function dealAndStart() {
    const deck = createTienLenDeck();
    const hands = dealCards(deck, 4);
    for (let i = 0; i < 4; i++) {
      players[i].hand = sortHand(hands[i]);
    }
    currentPlayerIdx = findThreeOfClubsOwner(hands);
    lastPlayedBy = currentPlayerIdx;
    isFirstMove = true;
    currentCombo = null;
    passedInRound.clear();
    selectedIndices.clear();
    finishOrder.length = 0;
    gameOver = false;

    renderAll();
    msgText.text = `${players[currentPlayerIdx].name} starts (has 3♣)`;
    beginTurn();
  }

  function beginTurn() {
    if (gameOver) return;
    updateHudButtons();
    updateHudStatus();
    updateTurnIndicators();

    if (currentPlayerIdx !== 0) {
      addTimeout(doAITurn, 1300);
    }
  }

  function doAITurn() {
    if (gameOver) return;
    const player = players[currentPlayerIdx];
    const combo = aiPickPlay(player.hand, currentCombo, isFirstMove);
    if (combo) {
      executePlay(combo);
    } else {
      executePass();
    }
  }

  function executePlay(combo: TienLenCombo) {
    const pIdx = currentPlayerIdx;
    const player = players[pIdx];

    const played = new Set(combo.cards);
    player.hand = player.hand.filter((c) => !played.has(c));

    currentCombo = combo;
    lastPlayedBy = pIdx;
    passedInRound.clear();
    isFirstMove = false;

    if (pIdx !== 0) {
      msgText.text = `${player.name} played ${comboLabel(combo)}`;
    } else {
      msgText.text = "";
    }

    if (player.hand.length === 0) {
      finishOrder.push(pIdx);
      const place = finishOrder.length;
      msgText.text = `${player.name} finished ${placeLabel(place)}!`;

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
        msgText.text = "";
        startNewRoundAfterFinish(pIdx);
      }, 1600);
      return;
    }

    renderAll();
    advanceTurn();
  }

  function executePass() {
    const pIdx = currentPlayerIdx;
    passedInRound.add(pIdx);

    if (pIdx !== 0) {
      msgText.text = `${players[pIdx].name} passed`;
    }

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

    const winnerName = players[lastPlayedBy].name;
    msgText.text = `${winnerName} wins the round!`;

    renderAll();
    addTimeout(() => {
      msgText.text = "";
      beginTurn();
    }, 1600);
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
    gameOver = true;
    renderAll();

    const overlay = new Graphics();
    overlay
      .rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT)
      .fill({ color: 0x000000, alpha: 0.78 });
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
        style: new TextStyle({
          fontSize: 22,
          fontWeight: "bold",
          fill: rowColors[rank],
        }),
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

      if (rank === 3) {
        const has2 = players[pIdx].hand.some((c) => c.rank === "2");
        if (has2) {
          const pen = new Text({
            text: "⚠ holds a 2",
            style: new TextStyle({ fontSize: 14, fill: "#ff9944" }),
          });
          pen.anchor.set(1, 0.5);
          pen.position.set(SCREEN_WIDTH / 2 + 260, y);
          root.addChild(pen);
        }
      }
    });

    const fixedChildCount = root.children.length;

    // Use HUD actions area for game-end buttons
    hud.querySelector("#tl-actions")!.innerHTML = `
      <button class="hud-btn hud-btn-green" id="tl-again">Play Again</button>
      <button class="hud-btn hud-btn-grey" id="tl-menu">Main Menu</button>
    `;
    hud.querySelector("#tl-again")!.addEventListener("click", () => {
      while (root.children.length > fixedChildCount) {
        root.removeChildAt(root.children.length - 1);
      }
      hud.querySelector("#tl-actions")!.innerHTML = `
        <button class="hud-btn hud-btn-green" id="tl-play" disabled>Play</button>
        <button class="hud-btn hud-btn-red" id="tl-pass" disabled>Pass</button>
      `;
      rewireButtons();
      dealAndStart();
    });
    hud
      .querySelector("#tl-menu")!
      .addEventListener("click", () => manager.goto("menu"));
  }

  // ── Button callbacks ───────────────────────────────────────────────────────

  function rewireButtons() {
    const pb = hud.querySelector<HTMLButtonElement>("#tl-play");
    const psb = hud.querySelector<HTMLButtonElement>("#tl-pass");
    if (pb) {
      pb.addEventListener("click", onPlay);
    }
    if (psb) {
      psb.addEventListener("click", onPass);
    }
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

    if (isFirstMove && !isValidFirstPlay(combo)) {
      hintEl.textContent = "First play must include the 3♣!";
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

  // ── Init ───────────────────────────────────────────────────────────────────
  dealAndStart();

  root.__teardown = () => {
    pendingTimeouts.forEach(clearTimeout);
    hud.remove();
  };

  return root;
};
