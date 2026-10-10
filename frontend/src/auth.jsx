import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { getMe, login as apiLogin, logout as apiLogout, signup as apiSignup } from './api.js';

// Login is optional. Without it everything works; with it, your checks are kept in "My history".
const AuthContext = createContext({ user: null, ready: true, login: async () => {}, signup: async () => {}, logout: async () => {}, modal: null, openAuth() {}, closeAuth() {} });

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState(null); // null | 'login' | 'signup'

  useEffect(() => {
    let cancelled = false;
    getMe().then(
      (data) => !cancelled && (setUser(data.user), setReady(true)),
      () => !cancelled && setReady(true),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await apiLogin(email, password);
    setUser(data.user);
    setModal(null);
  }, []);
  const signup = useCallback(async (email, password, name) => {
    const data = await apiSignup(email, password, name);
    setUser(data.user);
    setModal(null);
  }, []);
  const logout = useCallback(async () => {
    await apiLogout().catch(() => {});
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, login, signup, logout, modal, openAuth: (mode = 'login') => setModal(mode), closeAuth: () => setModal(null) }),
    [user, ready, login, signup, logout, modal],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
