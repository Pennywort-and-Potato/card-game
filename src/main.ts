import "./styles/main.css";
import { Application, Assets, Container } from "pixi.js";
import { SceneManager } from "./systems/scene-manager";
import { createAuthScene } from "./scenes/auth-scene";
import { createMenuScene } from "./scenes/menu-scene";
import { createLobbyScene } from "./scenes/lobby-scene";
import { createGameScene } from "./scenes/game-scene";
import { createPokerScene } from "./scenes/poker-scene";
import { createBigTwoScene } from "./scenes/big-two-scene";
import { createBigTwoMpScene } from "./scenes/big-two-mp-scene";
import { createBlackjackMpScene } from "./scenes/blackjack-mp-scene";
import { createPokerMpScene } from "./scenes/poker-mp-scene";
import { SCREEN_HEIGHT, SCREEN_WIDTH } from "./utils/constants";
import { setViewport } from "./utils/viewport";
import { getCurrentUser } from "./lib/auth";

const bootstrap = async () => {
  const app = new Application();

  await app.init({
    resizeTo: window,
    background: "#0f3d20",
    antialias: true,
    autoDensity: true,
    resolution: window.devicePixelRatio || 1,
  });

  document.getElementById("pixi-container")!.appendChild(app.canvas);

  // Viewport — scaled to fill window while keeping 16:9
  const viewport = new Container();
  app.stage.addChild(viewport);

  const resize = () => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    const scale = Math.min(width / SCREEN_WIDTH, height / SCREEN_HEIGHT);
    const offX = (width - SCREEN_WIDTH * scale) / 2;
    const offY = (height - SCREEN_HEIGHT * scale) / 2;

    viewport.scale.set(scale);
    viewport.position.set(offX, offY);
    setViewport(scale, offX, offY);

    // Sync CSS custom properties so HTML overlays can match the letterbox rect
    const root = document.documentElement.style;
    root.setProperty("--vp-left", `${offX}px`);
    root.setProperty("--vp-top", `${offY}px`);
    root.setProperty("--vp-width", `${SCREEN_WIDTH * scale}px`);
    root.setProperty("--vp-height", `${SCREEN_HEIGHT * scale}px`);
  };

  window.addEventListener("resize", resize);
  resize();

  // Preload card assets
  const suits = ["H", "D", "C", "S"];
  const ranks = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
  const cardPaths = suits.flatMap((s) => ranks.map((r) => `assets/cards/${r}-${s}.png`));
  const backPaths = ["back-blue", "back-red", "back-green", "back-black", "back-yellow"].map(
    (b) => `assets/cards/${b}.png`,
  );
  await Assets.load([...cardPaths, ...backPaths]);

  const manager = new SceneManager(viewport);
  manager
    .register("auth", (m) => createAuthScene(m))
    .register("menu", (m, p) => createMenuScene(m, p))
    .register("lobby", (m, p) => createLobbyScene(m, p))
    // Multiplayer if roomId present, solo otherwise
    .register("blackjack", (m, p) =>
      p.roomId ? createBlackjackMpScene(m, p) : createGameScene(m, p),
    )
    .register("poker", (m, p) =>
      p.roomId ? createPokerMpScene(m, p) : createPokerScene(m, p),
    )
    .register("bigtwo", (m, p) =>
      p.roomId ? createBigTwoMpScene(m, p) : createBigTwoScene(m, p),
    );

  // Route to auth if no active session, otherwise go straight to menu
  const user = await getCurrentUser();
  if (user) {
    manager.goto("menu", { playerName: user.displayName, userId: user.id });
  } else {
    manager.goto("auth");
  }
};

bootstrap();
