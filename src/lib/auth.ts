import { supabase } from "./supabase";

export type AuthUser = {
  id: string;
  email?: string;
  displayName: string;
  isGuest: boolean;
};

/** Return current session user, or null. */
export const getCurrentUser = async (): Promise<AuthUser | null> => {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  return toAuthUser(user);
};

/** Sign in with email + password. */
export const signIn = async (
  email: string,
  password: string,
): Promise<AuthUser> => {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(error.message);
  return toAuthUser(data.user);
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
  return toAuthUser(data.user);
};

/** Sign in anonymously as a guest. */
export const playAsGuest = async (displayName: string): Promise<AuthUser> => {
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: displayName } },
  });
  if (error) throw new Error(error.message);
  if (!data.user) throw new Error("Guest sign-in failed.");
  return toAuthUser(data.user);
};

export const signOut = async () => {
  await supabase.auth.signOut();
};

// ── Helpers ───────────────────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const toAuthUser = (user: any): AuthUser => {
  const meta = user.user_metadata ?? {};
  const displayName: string =
    meta.display_name ||
    meta.full_name ||
    user.email?.split("@")[0] ||
    "Player";
  return {
    id: user.id as string,
    email: user.email as string | undefined,
    displayName,
    isGuest: !user.email,
  };
};
