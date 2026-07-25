import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { ApiError, tokenStorage } from "../api/client";
import { deleteAccount, fetchMe, login, signup } from "../api/beamloop";
import type { SessionUser } from "../api/types";
import { clearIdeas } from "../ideas";
import { clearChannelGroups } from "../channelGroups";
import {
  registerForPushNotifications,
  unregisterForPushNotifications,
} from "../push";

interface AuthState {
  loading: boolean;
  user: SessionUser | null;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  deleteAccount: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<SessionUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const token = await tokenStorage.get();
        if (token) setUser(await fetchMe());
      } catch (e) {
        // Only a real auth rejection (401) means the token is bad. A network
        // error — server down/unreachable — must NOT destroy a valid session,
        // or a momentary blip silently logs the user out.
        if (e instanceof ApiError && e.status === 401) {
          await tokenStorage.clear();
        }
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Keep the device's push token pointed at whoever is currently signed in.
  // Never prompts here — the permission dialog is raised at the moment it
  // makes sense, when a post is sent. This only refreshes an existing grant.
  useEffect(() => {
    if (!user) return;
    void registerForPushNotifications({ askIfNeeded: false });
  }, [user?.id]);

  const signIn = useCallback(async (email: string, password: string) => {
    setUser(await login(email, password));
  }, []);

  const signUp = useCallback(async (email: string, password: string) => {
    setUser(await signup(email, password));
  }, []);

  const signOut = useCallback(async () => {
    // Detach the device first: once the token is cleared the request can no
    // longer authenticate.
    await unregisterForPushNotifications();
    await tokenStorage.clear();
    setUser(null);
  }, []);

  const removeAccount = useCallback(async () => {
    const userId = user?.id;
    await deleteAccount();
    if (userId) {
      clearIdeas(userId);
      clearChannelGroups(userId);
    }
    setUser(null);
  }, [user?.id]);

  const value = useMemo(
    () => ({
      loading,
      user,
      signIn,
      signUp,
      signOut,
      deleteAccount: removeAccount,
    }),
    [loading, user, signIn, signUp, signOut, removeAccount]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
