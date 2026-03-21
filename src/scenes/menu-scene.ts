import { Container, Graphics } from "pixi.js";
import type { SceneContainer } from "../systems/scene-manager";
import type { SceneManager } from "../systems/scene-manager";
import type { SceneParams } from "../types";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "../utils/constants";
import { fetchLeaderboard } from "../lib/game-api";
import { fetchMatchResults } from "../lib/game-state-api";
import { signOut, getCurrentUser } from "../lib/auth";

export const createMenuScene = (
  manager: SceneManager,
  params: SceneParams = {},
): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "menu-scene";

  const initialName = (params.playerName as string) || "Player";
  let userId = (params.userId as string) || "";

  const bg = new Graphics();
  bg.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0x08080f);
  root.addChild(bg);

  // ── HTML overlay ────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.className = "menu-overlay";
  overlay.innerHTML = `
    <button class="menu-signout-btn" id="menu-signout">Sign Out</button>

    <h1 class="menu-title">CARD GAMES</h1>
    <p class="menu-subtitle">Choose your game</p>

    <div class="menu-games-row">
      <div class="menu-game-card" id="card-blackjack" style="background:#141428;">
        <span class="menu-game-card-icon">🃏</span>
        <div class="menu-game-card-name">Blackjack</div>
        <div class="menu-game-card-desc">Beat the dealer to 21</div>
        <div class="menu-game-card-play">▶ PLAY</div>
      </div>
      <div class="menu-game-card" id="card-poker" style="background:#1c1028;">
        <span class="menu-game-card-icon">♠</span>
        <div class="menu-game-card-name">Poker</div>
        <div class="menu-game-card-desc">Texas Hold'em vs AI</div>
        <div class="menu-game-card-play">▶ PLAY</div>
      </div>
      <div class="menu-game-card" id="card-bigtwo" style="background:#201018;">
        <span class="menu-game-card-icon">🀄</span>
        <div class="menu-game-card-name">Big Two</div>
        <div class="menu-game-card-desc">Southern Vietnamese rules</div>
        <div class="menu-game-card-play">▶ PLAY</div>
      </div>
    </div>

    <div class="menu-name-section">
      <label class="menu-name-label" for="menu-name-input">Your Name</label>
      <input
        id="menu-name-input"
        class="menu-name-input"
        type="text"
        maxlength="16"
        placeholder="Enter your name"
        autocomplete="off"
        value=""
      />
    </div>

    <div class="menu-divider"></div>

    <div class="menu-lb-section">
      <div class="menu-tabs" id="menu-tabs">
        <button class="menu-tab active" data-tab="scores">Top Scores</button>
        <button class="menu-tab" data-tab="matches">Recent Matches</button>
      </div>

      <div id="menu-panel-scores" class="menu-tab-panel">
        <div class="menu-lb-list" id="menu-lb-list">
          <div class="menu-lb-row"><span class="menu-lb-rank">—</span><span>Loading…</span></div>
        </div>
      </div>

      <div id="menu-panel-matches" class="menu-tab-panel" style="display:none">
        <div class="menu-lb-list" id="menu-matches-list">
          <div class="menu-lb-row"><span class="menu-lb-rank">—</span><span>Loading…</span></div>
        </div>
      </div>
    </div>
  `;
  document.getElementById("pixi-container")!.appendChild(overlay);

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const nameInput =
    overlay.querySelector<HTMLInputElement>("#menu-name-input")!;
  nameInput.value = initialName;

  const getPlayerName = () => nameInput.value.trim() || "Player";

  const signOutBtn = overlay.querySelector<HTMLButtonElement>("#menu-signout")!;
  signOutBtn.addEventListener("click", () => {
    void signOut().then(() => manager.goto("auth"));
  });

  overlay.querySelector("#card-blackjack")!.addEventListener("click", () => {
    manager.goto("lobby", {
      playerName: getPlayerName(),
      userId,
      gameMode: "blackjack",
    });
  });
  overlay.querySelector("#card-poker")!.addEventListener("click", () => {
    manager.goto("lobby", {
      playerName: getPlayerName(),
      userId,
      gameMode: "poker",
    });
  });
  overlay.querySelector("#card-bigtwo")!.addEventListener("click", () => {
    manager.goto("lobby", {
      playerName: getPlayerName(),
      userId,
      gameMode: "bigtwo",
    });
  });

  // ── Load auth (fills userId and name if not passed via params) ──────────────
  void getCurrentUser().then((user) => {
    if (!user) {
      manager.goto("auth");
      return;
    }
    if (!userId) userId = user.id;
    if (nameInput.value === "Player" || !nameInput.value)
      nameInput.value = user.displayName;
  });

  // ── Tab switching ────────────────────────────────────────────────────────────
  const tabs = overlay.querySelectorAll<HTMLButtonElement>(".menu-tab");
  const panelScores = overlay.querySelector<HTMLDivElement>("#menu-panel-scores")!;
  const panelMatches = overlay.querySelector<HTMLDivElement>("#menu-panel-matches")!;
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.dataset["tab"];
      panelScores.style.display = which === "scores" ? "" : "none";
      panelMatches.style.display = which === "matches" ? "" : "none";
    });
  });

  // ── Leaderboard ─────────────────────────────────────────────────────────────
  const lbList = overlay.querySelector<HTMLDivElement>("#menu-lb-list")!;
  void fetchLeaderboard().then((entries) => {
    if (entries.length === 0) {
      lbList.innerHTML = `<div class="menu-lb-row"><span style="color:var(--text-muted);width:100%;text-align:center">No scores yet — be the first!</span></div>`;
      return;
    }
    lbList.innerHTML = entries
      .slice(0, 5)
      .map(
        (e, i) =>
          `<div class="menu-lb-row"><span class="menu-lb-rank">${i + 1}.</span><span>${e.player_name}</span><span>$${e.high_score}</span></div>`,
      )
      .join("");
  });

  // ── Recent Big Two matches ───────────────────────────────────────────────────
  const matchesList = overlay.querySelector<HTMLDivElement>("#menu-matches-list")!;
  void fetchMatchResults("bigtwo", 8).then((results) => {
    if (results.length === 0) {
      matchesList.innerHTML = `<div class="menu-lb-row"><span style="color:var(--text-muted);width:100%;text-align:center">No matches yet — play one!</span></div>`;
      return;
    }
    const placeIcons = ["🥇", "🥈", "🥉", "💀"];
    matchesList.innerHTML = results
      .map((r) => {
        const when = new Date(r.issued_at).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });
        const podium = r.finish_order
          .slice(0, 4)
          .map((p, i) => `${placeIcons[i] ?? (i + 1) + "."} ${p.name}`)
          .join(" · ");
        return `<div class="menu-lb-row menu-match-row">
          <span class="menu-lb-rank" style="font-size:10px;min-width:36px">${when}</span>
          <span style="flex:1;font-size:11px;color:var(--text)">${podium}</span>
        </div>`;
      })
      .join("");
  });

  // ── Teardown ─────────────────────────────────────────────────────────────────
  root.__teardown = () => {
    overlay.remove();
  };

  return root;
};
