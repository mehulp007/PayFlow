import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { LoginResult, User } from '@payflow/shared';
import { api, AUTH_EXPIRED_EVENT, sessionToken } from '../lib/api';

interface AuthContextValue {
  user: User | null;
  checking: boolean;
  signIn(username: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  /** Clears the local session without calling the API (after a password change ends all sessions). */
  forget(): void;
  /** Switches to a session the API just issued (sign-up, accepted invitation, or "View as"). */
  adopt(result: LoginResult): void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(() => Boolean(sessionToken.get()));

  const forget = useCallback(() => {
    sessionToken.set(null);
    setUser(null);
    queryClient.clear();
  }, [queryClient]);

  useEffect(() => {
    if (!sessionToken.get()) return;
    api
      .get<{ user: User }>('/auth/me')
      .then(result => setUser(result.user))
      .catch(() => sessionToken.set(null))
      .finally(() => setChecking(false));
  }, []);

  useEffect(() => {
    window.addEventListener(AUTH_EXPIRED_EVENT, forget);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, forget);
  }, [forget]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      checking,
      forget,
      adopt(result) {
        queryClient.clear();
        sessionToken.set(result.token);
        setUser(result.user);
      },
      async signIn(username, password) {
        const result = await api.post<LoginResult>('/auth/login', { username, password });
        queryClient.clear();
        sessionToken.set(result.token);
        setUser(result.user);
      },
      async signOut() {
        try {
          await api.post('/auth/logout');
        } catch {
          // The session may already have expired; sign out locally regardless.
        } finally {
          forget();
        }
      },
    }),
    [user, checking, forget, queryClient],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside AuthProvider');
  return context;
}

/** The signed-in user; only for components rendered behind RequireAuth. */
export function useUser(): User {
  const { user } = useAuth();
  if (!user) throw new Error('useUser requires a signed-in user');
  return user;
}
