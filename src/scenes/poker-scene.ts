import { Container, Text, TextStyle } from "pixi.js";
import type { SceneContainer } from "../systems/scene-manager";
import type { SceneManager } from "../systems/scene-manager";
import type {
  CardData,
  PokerGameState,
  PokerStreet,
  SceneParams,
} from "../types";
import {
  addCardToHand,
  centerHand,
  clearHand,
  createCardHand,
  flipCardAtIndex,
  getHandCards,
} from "../entities/card-hand";
import { createTableBackground, createButton } from "../utils/mock-graphics";
import {
  createDeck,
  shuffleDeck,
  evaluateBestHand,
  comparePokerHands,
  handStrength,
} from "../systems/poker-logic";
import { saveRoundResult } from "../lib/game-api";
import {
  CARD_HEIGHT,
  DEALER_HAND_Y,
  PLAYER_HAND_Y,
  POKER_AI_THINK_MS,
  POKER_ANTE,
  POKER_COMMUNITY_Y,
  POKER_DEAL_DELAY_MS,
  POKER_DEALER_LABEL_Y,
  POKER_PLAYER_LABEL_Y,
  POKER_RAISE_AMOUNT,
  POKER_STREET_PAUSE_MS,
  SCREEN_HEIGHT,
  SCREEN_WIDTH,
  STARTING_BALANCE,
} from "../utils/constants";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createPokerScene = (
  manager: SceneManager,
  params: SceneParams,
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "poker-scene";

  const playerName = (params.playerName as string) ?? "Player";

  // ---- Table ----
  root.addChild(createTableBackground());

  // ---- Labels ----
  const areaStyle = new TextStyle({ fontSize: 11, fill: "#88cc88" });

  const dealerAreaLabel = new Text({ text: "— DEALER —", style: areaStyle });
  dealerAreaLabel.anchor.set(0.5);
  dealerAreaLabel.alpha = 0.7;
  dealerAreaLabel.position.set(SCREEN_WIDTH / 2, POKER_DEALER_LABEL_Y);

  const playerAreaLabel = new Text({ text: "— PLAYER —", style: areaStyle });
  playerAreaLabel.anchor.set(0.5);
  playerAreaLabel.alpha = 0.7;
  playerAreaLabel.position.set(SCREEN_WIDTH / 2, POKER_PLAYER_LABEL_Y);

  const scoreStyle = new TextStyle({
    fontSize: 14,
    fontWeight: "bold",
    fill: "#ccffcc",
  });

  const dealerHandLabel = new Text({ text: "", style: scoreStyle });
  dealerHandLabel.position.set(20, DEALER_HAND_Y + CARD_HEIGHT + 10);

  const playerHandLabel = new Text({ text: "", style: scoreStyle });
  playerHandLabel.position.set(20, PLAYER_HAND_Y + CARD_HEIGHT + 10);

  // ---- Info (top-left) ----
  const balanceText = new Text({
    text: `Balance: $${STARTING_BALANCE}`,
    style: new TextStyle({ fontSize: 18, fontWeight: "bold", fill: "#f0c040" }),
  });
  balanceText.position.set(20, 18);

  const betText = new Text({
    text: "Bet: $0",
    style: new TextStyle({ fontSize: 15, fill: "#ffffff" }),
  });
  betText.position.set(20, 46);

  // ---- Pot (center above community) ----
  const potText = new Text({
    text: "",
    style: new TextStyle({ fontSize: 18, fontWeight: "bold", fill: "#d4af37" }),
  });
  potText.anchor.set(0.5);
  potText.position.set(SCREEN_WIDTH / 2, POKER_COMMUNITY_Y - 32);

  // ---- Street indicator ----
  const streetText = new Text({
    text: "",
    style: new TextStyle({ fontSize: 13, fill: "#88aa88", letterSpacing: 2 }),
  });
  streetText.anchor.set(0.5);
  streetText.position.set(
    SCREEN_WIDTH / 2,
    POKER_COMMUNITY_Y + CARD_HEIGHT + 14,
  );

  // ---- Message (center) ----
  const msgText = new Text({
    text: "",
    style: new TextStyle({ fontSize: 26, fontWeight: "bold", fill: "#f0c040" }),
  });
  msgText.anchor.set(0.5);
  msgText.position.set(SCREEN_WIDTH / 2, SCREEN_HEIGHT / 2);

  // ---- Card hands ----
  const dealerHole = createCardHand("dealer-hole");
  const playerHole = createCardHand("player-hole");
  const communityHand = createCardHand("community");

  root.addChild(
    dealerHole,
    playerHole,
    communityHand,
    dealerAreaLabel,
    playerAreaLabel,
    dealerHandLabel,
    playerHandLabel,
    balanceText,
    betText,
    potText,
    streetText,
    msgText,
  );

  // ---- PixiJS Buttons ----
  const BTN_Y = SCREEN_HEIGHT - 60;
  const BTN_RIGHT_X = SCREEN_WIDTH - 134;

  const foldBtn = createButton("Fold", 110, 42, 0xc0392b);
  const checkBtn = createButton("Check", 110, 42, 0x2980b9);
  const raiseBtn = createButton(
    `Raise $${POKER_RAISE_AMOUNT}`,
    110,
    42,
    0x8e44ad,
  );
  const callBtn = createButton(
    `Call $${POKER_RAISE_AMOUNT}`,
    110,
    42,
    0x27ae60,
  );
  const newRoundBtn = createButton("New Round", 130, 42, 0x27ae60);

  foldBtn.position.set(BTN_RIGHT_X - 240, BTN_Y);
  checkBtn.position.set(BTN_RIGHT_X - 120, BTN_Y);
  raiseBtn.position.set(BTN_RIGHT_X, BTN_Y);
  callBtn.position.set(BTN_RIGHT_X - 60, BTN_Y);
  newRoundBtn.position.set(SCREEN_WIDTH / 2 - 65, BTN_Y);

  root.addChild(foldBtn, checkBtn, raiseBtn, callBtn, newRoundBtn);

  // ---- HTML HUD: back button ----
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="pk-back">← Menu</button>
      <span class="hud-title">POKER</span>
      <div style="width:90px"></div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  hud
    .querySelector("#pk-back")!
    .addEventListener("click", () => manager.goto("menu"));

  // ---- Game State ----
  let gameState: PokerGameState = "idle";
  let street: PokerStreet = "pre-flop";
  let deck: CardData[] = [];
  let balance = (params.balance as number) ?? STARTING_BALANCE;
  let playerBet = 0;
  let pot = 0;

  const setState = (s: PokerGameState) => {
    gameState = s;
    const isPlayerAct = s === "player-act";
    const isPlayerRespond = s === "player-respond";
    const isOver = s === "round-over";

    foldBtn.visible = isPlayerAct || isPlayerRespond;
    checkBtn.visible = isPlayerAct;
    raiseBtn.visible = isPlayerAct;
    callBtn.visible = isPlayerRespond;
    newRoundBtn.visible = isOver;
  };

  const showMsg = (msg: string) => {
    msgText.text = msg;
  };
  const clearMsg = () => {
    msgText.text = "";
  };

  const dealCard = (faceUp: boolean): CardData => {
    if (deck.length < 10) deck = shuffleDeck(createDeck());
    const card = deck.pop()!;
    card.isFaceUp = faceUp;
    return card;
  };

  const updateLabels = () => {
    const ph = getHandCards(playerHole);
    const comm = getHandCards(communityHand);
    if (ph.length >= 1) {
      const ev = evaluateBestHand(ph, comm);
      playerHandLabel.text = ev.rank > 0 ? ev.label : "";
    } else {
      playerHandLabel.text = "";
    }
    dealerHandLabel.text =
      gameState === "showdown" || gameState === "round-over"
        ? evaluateBestHand(getHandCards(dealerHole), comm).label
        : getHandCards(dealerHole).some((c) => c.isFaceUp)
          ? "?"
          : "";

    potText.text = pot > 0 ? `Pot: $${pot}` : "";
    balanceText.text = `Balance: $${balance}`;
    betText.text = `Bet: $${playerBet}`;
    streetText.text =
      street !== "pre-flop" ? street.replace("-", " ").toUpperCase() : "";
  };

  // ---- Game flow ----
  const startRound = async () => {
    if (balance < POKER_ANTE) {
      showMsg("Not enough balance for ante!");
      setState("round-over");
      return;
    }

    deck = shuffleDeck(createDeck());
    clearHand(dealerHole);
    clearHand(playerHole);
    clearHand(communityHand);
    street = "pre-flop";
    playerBet = POKER_ANTE;
    pot = POKER_ANTE * 2;
    balance -= POKER_ANTE;

    setState("dealing");
    clearMsg();
    updateLabels();

    addCardToHand(playerHole, dealCard(true));
    centerHand(playerHole, PLAYER_HAND_Y);
    await delay(POKER_DEAL_DELAY_MS);

    addCardToHand(dealerHole, dealCard(false));
    centerHand(dealerHole, DEALER_HAND_Y);
    await delay(POKER_DEAL_DELAY_MS);

    addCardToHand(playerHole, dealCard(true));
    centerHand(playerHole, PLAYER_HAND_Y);
    await delay(POKER_DEAL_DELAY_MS);

    addCardToHand(dealerHole, dealCard(false));
    centerHand(dealerHole, DEALER_HAND_Y);

    updateLabels();
    setState("player-act");
  };

  const advanceStreet = async () => {
    setState("dealing");
    clearMsg();

    if (street === "pre-flop") {
      street = "flop";
      for (let i = 0; i < 3; i++) {
        addCardToHand(communityHand, dealCard(true));
        centerHand(communityHand, POKER_COMMUNITY_Y);
        updateLabels();
        await delay(POKER_DEAL_DELAY_MS);
      }
    } else if (street === "flop") {
      street = "turn";
      addCardToHand(communityHand, dealCard(true));
      centerHand(communityHand, POKER_COMMUNITY_Y);
      updateLabels();
      await delay(POKER_DEAL_DELAY_MS);
    } else if (street === "turn") {
      street = "river";
      addCardToHand(communityHand, dealCard(true));
      centerHand(communityHand, POKER_COMMUNITY_Y);
      updateLabels();
      await delay(POKER_DEAL_DELAY_MS);
    } else {
      await doShowdown();
      return;
    }

    updateLabels();
    await delay(POKER_STREET_PAUSE_MS);
    setState("player-act");
  };

  const dealerAct = async () => {
    setState("ai-acting");
    showMsg("Dealer thinking…");
    await delay(POKER_AI_THINK_MS);
    clearMsg();

    const dh = getHandCards(dealerHole);
    const comm = getHandCards(communityHand);
    const strength = handStrength(
      dh.map((c) => ({ ...c, isFaceUp: true })),
      comm,
    );
    const willRaise = Math.random() < 0.2 + strength * 0.3;

    if (willRaise) {
      pot += POKER_RAISE_AMOUNT;
      updateLabels();
      showMsg(`Dealer raises $${POKER_RAISE_AMOUNT}!`);
      await delay(600);
      clearMsg();
      setState("player-respond");
    } else {
      showMsg("Dealer checks.");
      await delay(600);
      await advanceStreet();
    }
  };

  const doShowdown = async () => {
    setState("showdown");
    flipCardAtIndex(dealerHole, 0, true);
    flipCardAtIndex(dealerHole, 1, true);
    updateLabels();
    await delay(800);

    const ph = getHandCards(playerHole);
    const dh = getHandCards(dealerHole);
    const comm = getHandCards(communityHand);
    const playerEval = evaluateBestHand(ph, comm);
    const dealerEval = evaluateBestHand(dh, comm);

    updateLabels();
    await delay(500);

    const cmp = comparePokerHands(playerEval, dealerEval);
    if (cmp === "h1") {
      balance += pot;
      showMsg(`You win $${pot}! (${playerEval.label})`);
      void saveRoundResult({
        playerName,
        result: "player-win",
        bet: playerBet,
        balanceAfter: balance,
      });
    } else if (cmp === "h2") {
      showMsg(`Dealer wins! (${dealerEval.label})`);
      void saveRoundResult({
        playerName,
        result: "dealer-win",
        bet: playerBet,
        balanceAfter: balance,
      });
    } else {
      balance += playerBet;
      showMsg(`Tie! (${playerEval.label})`);
      void saveRoundResult({
        playerName,
        result: "push",
        bet: playerBet,
        balanceAfter: balance,
      });
    }

    updateLabels();
    setState("round-over");
  };

  // ---- Player actions ----
  foldBtn.on("pointerdown", () => {
    if (gameState !== "player-act" && gameState !== "player-respond") return;
    showMsg("You folded. Dealer wins.");
    void saveRoundResult({
      playerName,
      result: "dealer-win",
      bet: playerBet,
      balanceAfter: balance,
    });
    setState("round-over");
  });

  checkBtn.on("pointerdown", () => {
    if (gameState !== "player-act") return;
    void dealerAct();
  });

  raiseBtn.on("pointerdown", () => {
    if (gameState !== "player-act") return;
    if (balance < POKER_RAISE_AMOUNT) {
      showMsg("Not enough balance!");
      return;
    }
    balance -= POKER_RAISE_AMOUNT;
    playerBet += POKER_RAISE_AMOUNT;
    pot += POKER_RAISE_AMOUNT * 2;
    updateLabels();
    void advanceStreet();
  });

  callBtn.on("pointerdown", () => {
    if (gameState !== "player-respond") return;
    if (balance < POKER_RAISE_AMOUNT) {
      showMsg("Not enough balance!");
      return;
    }
    balance -= POKER_RAISE_AMOUNT;
    playerBet += POKER_RAISE_AMOUNT;
    pot += POKER_RAISE_AMOUNT;
    updateLabels();
    void advanceStreet();
  });

  newRoundBtn.on("pointerdown", () => {
    setState("idle");
    void startRound();
  });

  // Auto-start
  setState("idle");
  void startRound();

  root.__teardown = () => {
    hud.remove();
  };

  return root;
};
