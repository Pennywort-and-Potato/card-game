import "./styles/main.css";
import { Application, Container } from "pixi.js";
import { SceneManager } from "./systems/scene-manager";
import { createAuthScene } from "./scenes/auth-scene";
import { createMenuScene } from "./scenes/menu-scene";
import { createLobbyScene } from "./scenes/lobby-scene";
import { createGameScene } from "./scenes/game-scene";
import { createPokerScene } from "./scenes/poker-scene";
import { createTienLenScene } from "./scenes/tienlen-scene";
import { createBlackjackMpScene } from "./scenes/blackjack-mp-scene";
import { createPokerMpScene } from "./scenes/poker-mp-scene";
import { createTienLenMpScene } from "./scenes/tienlen-mp-scene";
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
    const scale = Math.min(
      app.screen.width / SCREEN_WIDTH,
      app.screen.height / SCREEN_HEIGHT,
    );
    const offX = (app.screen.width - SCREEN_WIDTH * scale) / 2;
    const offY = (app.screen.height - SCREEN_HEIGHT * scale) / 2;
    viewport.scale.set(scale);
    viewport.position.set(offX, offY);
    setViewport(scale, offX, offY);
  };
  window.addEventListener("resize", resize);
  resize();

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
    .register("tienlen", (m, p) =>
      p.roomId ? createTienLenMpScene(m, p) : createTienLenScene(m, p),
    );

  // Route to auth if no active session, otherwise go straight to menu
  const user = await getCurrentUser();
  if (user) {
    manager.goto("menu", { playerName: user.displayName });
  } else {
    manager.goto("auth");
  }
};

bootstrap();
