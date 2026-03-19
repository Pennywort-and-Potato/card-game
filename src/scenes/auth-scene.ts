import { Container, Graphics } from "pixi.js";
import type { SceneContainer, SceneManager } from "../systems/scene-manager";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "../utils/constants";
import { signIn, signUp, playAsGuest } from "../lib/auth";

type AuthMode = "login" | "signup";

export const createAuthScene = (manager: SceneManager): SceneContainer => {
  const root = new Container() as SceneContainer;
  root.label = "auth-scene";

  // Minimal PixiJS background — the real UI is the HTML overlay below
  const bg = new Graphics();
  bg.rect(0, 0, SCREEN_WIDTH, SCREEN_HEIGHT).fill(0x08080f);
  root.addChild(bg);

  // ── HTML overlay ────────────────────────────────────────────────────────────
  const overlay = document.createElement("div");
  overlay.className = "auth-overlay";
  overlay.innerHTML = `
    <div class="auth-card">
      <div class="auth-header">
        <span class="auth-suit">♠</span>
        <h1>CARD GAMES</h1>
        <p>Sign in to play</p>
      </div>

      <div class="auth-tabs">
        <button class="auth-tab active" id="tab-login">Sign In</button>
        <button class="auth-tab" id="tab-signup">Sign Up</button>
      </div>

      <div class="auth-body">
        <form id="auth-form">
          <div class="form-group" id="name-group" style="display:none">
            <label>Display name</label>
            <input id="auth-name" type="text" maxlength="16" placeholder="Your in-game name" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>Email</label>
            <input id="auth-email" type="email" placeholder="you@example.com" autocomplete="email" />
          </div>
          <div class="form-group">
            <label>Password</label>
            <input id="auth-pass" type="password" placeholder="••••••••" autocomplete="current-password" />
          </div>
          <button type="submit" class="btn-primary" id="auth-submit">Sign In</button>
        </form>

        <div class="auth-divider"><span>or play as guest</span></div>

        <div class="auth-guest">
          <input id="guest-name" type="text" maxlength="16" placeholder="Your name" value="Player" autocomplete="off" />
          <button class="btn-ghost" id="guest-btn">Play as Guest</button>
        </div>

        <p class="auth-status" id="auth-status"></p>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  // ── DOM refs ────────────────────────────────────────────────────────────────
  const tabLogin = overlay.querySelector<HTMLButtonElement>("#tab-login")!;
  const tabSignup = overlay.querySelector<HTMLButtonElement>("#tab-signup")!;
  const nameGroup = overlay.querySelector<HTMLDivElement>("#name-group")!;
  const authName = overlay.querySelector<HTMLInputElement>("#auth-name")!;
  const authEmail = overlay.querySelector<HTMLInputElement>("#auth-email")!;
  const authPass = overlay.querySelector<HTMLInputElement>("#auth-pass")!;
  const authSubmit = overlay.querySelector<HTMLButtonElement>("#auth-submit")!;
  const authForm = overlay.querySelector<HTMLFormElement>("#auth-form")!;
  const guestName = overlay.querySelector<HTMLInputElement>("#guest-name")!;
  const guestBtn = overlay.querySelector<HTMLButtonElement>("#guest-btn")!;
  const statusEl = overlay.querySelector<HTMLParagraphElement>("#auth-status")!;

  let mode: AuthMode = "login";

  const setStatus = (msg: string, ok = false) => {
    statusEl.textContent = msg;
    statusEl.className = "auth-status" + (ok ? " ok" : "");
  };

  const setLoading = (loading: boolean) => {
    authSubmit.disabled = loading;
    guestBtn.disabled = loading;
    authSubmit.textContent = loading
      ? "Please wait…"
      : mode === "login"
        ? "Sign In"
        : "Create Account";
  };

  // ── Tab switching ────────────────────────────────────────────────────────────
  const switchMode = (next: AuthMode) => {
    mode = next;
    tabLogin.classList.toggle("active", mode === "login");
    tabSignup.classList.toggle("active", mode === "signup");
    nameGroup.style.display = mode === "signup" ? "" : "none";
    authSubmit.textContent = mode === "login" ? "Sign In" : "Create Account";
    authPass.autocomplete =
      mode === "login" ? "current-password" : "new-password";
    setStatus("");
  };

  tabLogin.addEventListener("click", () => switchMode("login"));
  tabSignup.addEventListener("click", () => switchMode("signup"));

  // ── Form submit ──────────────────────────────────────────────────────────────
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = authEmail.value.trim();
    const pass = authPass.value;
    if (!email || !pass) {
      setStatus("Please fill in all fields.");
      return;
    }
    setLoading(true);
    setStatus("");
    try {
      let user;
      if (mode === "login") {
        user = await signIn(email, pass);
      } else {
        const name = authName.value.trim() || email.split("@")[0];
        user = await signUp(email, pass, name);
        if (!user) {
          setStatus(
            "Account created! Check your email to confirm, then sign in.",
            true,
          );
          setLoading(false);
          return;
        }
      }
      manager.goto("menu", { playerName: user.displayName });
    } catch (err) {
      setStatus((err as Error).message);
      setLoading(false);
    }
  });

  // ── Guest ─────────────────────────────────────────────────────────────────────
  guestBtn.addEventListener("click", async () => {
    const name = guestName.value.trim() || "Player";
    setLoading(true);
    setStatus("");
    try {
      const user = await playAsGuest(name);
      manager.goto("menu", { playerName: user.displayName });
    } catch (err) {
      setStatus((err as Error).message);
      setLoading(false);
    }
  });

  // ── Teardown ──────────────────────────────────────────────────────────────────
  root.__teardown = () => {
    overlay.remove();
  };

  return root;
};
