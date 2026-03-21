import { Assets, Container, Graphics, Text, TextStyle } from "pixi.js";
import type { GameResult, GameState, SceneParams } from "../types";
import type { SceneContainer } from "../systems/scene-manager";
import type { SceneManager } from "../systems/scene-manager";
import { saveRoundResult } from "../lib/game-api";
import {
  addCardToHand,
  centerHand,
  clearHand,
  createCardHand,
  flipCardAtIndex,
  getHandCards,
} from "../entities/card-hand";
import { createUIScene } from "./ui-scene";
import {
  calculateHandValue,
  createDeck,
  determineWinner,
  shuffleDeck,
  shouldDealerHit,
} from "../systems/blackjack-logic";
import {
  DEAL_DELAY_MS,
  DEALER_DRAW_DELAY_MS,
  DEALER_HAND_Y,
  PLAYER_HAND_Y,
  SCREEN_WIDTH,
  STARTING_BALANCE,
} from "../utils/constants";

const delay = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export const createGameScene = (
  manager: SceneManager,
  params: SceneParams,
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "game-scene";
  const playerName = (params.playerName as string) ?? "Anonymous";

  // ---- Table ----
  const bg = new Graphics(Assets.get("assets/bg/bg.svg"));
  bg.scale.set(SCREEN_WIDTH / 1920);
  root.addChild(bg);

  // ---- Score labels ----
  const scoreLabelStyle = new TextStyle({
    fontSize: 15,
    fill: "#ccffcc",
    fontWeight: "bold",
  });
  const dealerLabel = new Text({
    text: "Dealer",
    style: new TextStyle({ fontSize: 13, fill: "#aaffaa" }),
  });
  const dealerScoreText = new Text({ text: "", style: scoreLabelStyle });
  const playerLabel = new Text({
    text: "You",
    style: new TextStyle({ fontSize: 13, fill: "#aaffaa" }),
  });
  const playerScoreText = new Text({ text: "", style: scoreLabelStyle });

  dealerLabel.position.set(20, DEALER_HAND_Y + 8);
  dealerScoreText.position.set(20, DEALER_HAND_Y + 26);
  playerLabel.position.set(20, PLAYER_HAND_Y + 8);
  playerScoreText.position.set(20, PLAYER_HAND_Y + 26);

  // ---- Card hands ----
  const dealerHand = createCardHand("dealer-hand");
  const playerHand = createCardHand("player-hand");

  root.addChild(
    dealerHand,
    playerHand,
    dealerLabel,
    dealerScoreText,
    playerLabel,
    playerScoreText,
  );

  // ---- UI overlay ----
  const ui = createUIScene();
  root.addChild(ui.container);

  // ---- HTML HUD: back button ----
  const hud = document.createElement("div");
  hud.className = "game-hud";
  hud.innerHTML = `
    <div class="hud-topbar">
      <button class="hud-back-btn" id="gs-back">← Menu</button>
      <span class="hud-title">BLACKJACK</span>
      <div style="width:90px"></div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(hud);

  hud
    .querySelector("#gs-back")!
    .addEventListener("click", () => manager.goto("menu"));

  // ---- Game state ----
  let gameState: GameState = "betting";
  let deck = shuffleDeck(createDeck());
  let balance = (params.balance as number) ?? STARTING_BALANCE;
  let currentBet = 0;

  ui.updateBalance(balance);

  // ---- Helpers ----
  const dealCard = (faceUp: boolean) => {
    if (deck.length < 15) deck = shuffleDeck(createDeck());
    const card = deck.pop()!;
    card.isFaceUp = faceUp;
    return card;
  };

  const updateScores = () => {
    const playerCards = getHandCards(playerHand);
    const dealerCards = getHandCards(dealerHand);

    if (playerCards.length > 0) {
      const pv = calculateHandValue(playerCards);
      playerScoreText.text = pv.isBust
        ? "Bust!"
        : `${pv.isSoft ? "Soft " : ""}${pv.value}`;
    } else {
      playerScoreText.text = "";
    }

    if (dealerCards.length > 0) {
      const hasHoleCard = dealerCards.some((c) => !c.isFaceUp);
      const dv = calculateHandValue(dealerCards);
      dealerScoreText.text = hasHoleCard
        ? `${dv.value} + ?`
        : dv.isBust
          ? "Bust!"
          : `${dv.isSoft ? "Soft " : ""}${dv.value}`;
    } else {
      dealerScoreText.text = "";
    }
  };

  const setState = (state: GameState) => {
    gameState = state;
    ui.syncState(state);
  };

  // ---- Game flow ----
  const startNewRound = () => {
    clearHand(playerHand);
    clearHand(dealerHand);
    currentBet = 0;
    ui.updateBet(0);
    ui.updateMessage("Place your bet!");
    updateScores();
    setState("betting");
  };

  const deal = async () => {
    if (currentBet === 0 || gameState !== "betting") return;

    setState("dealing");

    addCardToHand(playerHand, dealCard(true));
    centerHand(playerHand, PLAYER_HAND_Y);
    updateScores();
    await delay(DEAL_DELAY_MS);

    addCardToHand(dealerHand, dealCard(true));
    centerHand(dealerHand, DEALER_HAND_Y);
    updateScores();
    await delay(DEAL_DELAY_MS);

    addCardToHand(playerHand, dealCard(true));
    centerHand(playerHand, PLAYER_HAND_Y);
    updateScores();
    await delay(DEAL_DELAY_MS);

    addCardToHand(dealerHand, dealCard(false));
    centerHand(dealerHand, DEALER_HAND_Y);
    updateScores();
    await delay(DEAL_DELAY_MS);

    const pv = calculateHandValue(getHandCards(playerHand));
    if (pv.isBlackjack) {
      await startDealerTurn();
      return;
    }

    setState("player-turn");
    ui.updateMessage("");
  };

  const hit = async () => {
    if (gameState !== "player-turn") return;
    addCardToHand(playerHand, dealCard(true));
    centerHand(playerHand, PLAYER_HAND_Y);
    updateScores();
    const pv = calculateHandValue(getHandCards(playerHand));
    if (pv.isBust) {
      await delay(400);
      endGame("dealer-win");
    }
  };

  const stand = async () => {
    if (gameState !== "player-turn") return;
    await startDealerTurn();
  };

  const doubleDown = async () => {
    if (gameState !== "player-turn") return;
    if (balance < currentBet) {
      ui.updateMessage("Not enough balance!");
      return;
    }
    balance -= currentBet;
    currentBet *= 2;
    ui.updateBalance(balance);
    ui.updateBet(currentBet);

    addCardToHand(playerHand, dealCard(true));
    centerHand(playerHand, PLAYER_HAND_Y);
    updateScores();

    const pv = calculateHandValue(getHandCards(playerHand));
    await delay(400);
    if (pv.isBust) {
      endGame("dealer-win");
    } else {
      await startDealerTurn();
    }
  };

  const startDealerTurn = async () => {
    setState("dealer-turn");
    flipCardAtIndex(dealerHand, 1, true);
    updateScores();
    await delay(DEALER_DRAW_DELAY_MS);

    while (shouldDealerHit(getHandCards(dealerHand))) {
      addCardToHand(dealerHand, dealCard(true));
      centerHand(dealerHand, DEALER_HAND_Y);
      updateScores();
      await delay(DEALER_DRAW_DELAY_MS);
    }

    const result = determineWinner(
      getHandCards(playerHand),
      getHandCards(dealerHand),
    );
    endGame(result);
  };

  const endGame = (result: GameResult) => {
    const messages: Record<GameResult, string> = {
      blackjack: "★ Blackjack! You win 3:2! ★",
      "player-win": "You win!",
      "dealer-win": "Dealer wins.",
      push: "Push — it's a tie.",
    };

    const payouts: Record<GameResult, number> = {
      blackjack: Math.floor(currentBet * 2.5),
      "player-win": currentBet * 2,
      "dealer-win": 0,
      push: currentBet,
    };

    balance += payouts[result];
    ui.updateBalance(balance);
    ui.updateMessage(messages[result]);
    setState("game-over");

    void saveRoundResult({
      playerName,
      result,
      bet: currentBet,
      balanceAfter: balance,
    });
  };

  // ---- Wire UI callbacks ----
  ui.onChipBet((value) => {
    if (gameState !== "betting") return;
    if (balance < value) {
      ui.updateMessage("Not enough balance!");
      return;
    }
    balance -= value;
    currentBet += value;
    ui.updateBalance(balance);
    ui.updateBet(currentBet);
    ui.updateMessage(`Bet: $${currentBet} — click Deal to start`);
  });

  ui.onDeal(() => {
    void deal();
  });
  ui.onHit(() => {
    void hit();
  });
  ui.onStand(() => {
    void stand();
  });
  ui.onDouble(() => {
    void doubleDown();
  });
  ui.onNewRound(() => startNewRound());
  ui.onMenu(() => manager.goto("menu"));

  // ---- Dealer / Player area labels (top decorations) ----
  const areaLabelStyle = new TextStyle({ fontSize: 11, fill: "#88cc88" });
  const dealerAreaLabel = new Text({
    text: "— DEALER —",
    style: areaLabelStyle,
  });
  dealerAreaLabel.anchor.set(0.5);
  dealerAreaLabel.alpha = 0.7;
  dealerAreaLabel.position.set(SCREEN_WIDTH / 2, DEALER_HAND_Y - 18);

  const playerAreaLabel = new Text({
    text: "— PLAYER —",
    style: areaLabelStyle,
  });
  playerAreaLabel.anchor.set(0.5);
  playerAreaLabel.alpha = 0.7;
  playerAreaLabel.position.set(SCREEN_WIDTH / 2, PLAYER_HAND_Y - 18);

  root.addChild(dealerAreaLabel, playerAreaLabel);

  root.__teardown = () => {
    hud.remove();
  };

  return root;
};
