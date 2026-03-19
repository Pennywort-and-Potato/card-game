import { supabase } from "./supabase";

export type AuthUser = {
  id: string;
  email?: string;
  displayName: string;
  isGuest: boolean;
};

type CachedAuth = AuthUser & {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

const CACHE_KEY = "card_game_auth";

const saveCache = (user: AuthUser, accessToken: string, refreshToken: string, expiresAt: number) => {
  const cache: CachedAuth = { ...user, accessToken, refreshToken, expiresAt };
  localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
};

const loadCache = (): CachedAuth | null => {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    return raw ? (JSON.parse(raw) as CachedAuth) : null;
  } catch {
    return null;
  }
};

const clearCache = () => localStorage.removeItem(CACHE_KEY);

/** Return current session user, or null. */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  // Use local session first (no network call) then validate with server
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    clearCache();
    return null;
  }

  const cached = loadCache();
  const user = toAuthUser(session.user, cached?.displayName);

  // Keep cache in sync with latest session tokens
  saveCache(user, session.access_token, session.refresh_token ?? "", session.expires_at ?? 0);

  return user;
};

/** Sign in with email + password. */
export const signIn = async (
  email: string,
  password: string,
): Promise<AuthUser> => {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(error.message);
  const user = toAuthUser(data.user);
  saveCache(user, data.session.access_token, data.session.refresh_token, data.session.expires_at ?? 0);
  return user;
};

/** Sign up with email + password + display name. */
export const signUp = async (
  email: string,
  password: string,
  displayName: string,
): Promise<AuthUser> => {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Sign-up failed — please try again.");
  const user = toAuthUser(data.user, displayName);
  if (data.session) {
    saveCache(user, data.session.access_token, data.session.refresh_token, data.session.expires_at ?? 0);
  }
  return user;
};

/** Sign in anonymously as a guest. */
export const playAsGuest = async (displayName: string): Promise<AuthUser> => {
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Guest sign-in failed.");
  const user = toAuthUser(data.user, displayName);
  if (data.session) {
    saveCache(user, data.session.access_token, data.session.refresh_token, data.session.expires_at ?? 0);
  }
  return user;
};

export const signOut = async () => {
  clearCache();
  await supabase.auth.signOut();
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toAuthUser = (user: any, fallbackName?: string): AuthUser => {
  const meta = user.user_metadata ?? {};
  const displayName: string =
    meta.display_name ||
    meta.full_name ||
    user.email?.split("@")[0] ||
    fallbackName ||
    loadCache()?.displayName ||
    "Player";
  return {
    id: user.id as string,
    email: user.email as string | undefined,
    displayName,
    isGuest: !user.email,
  };
};
