import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from './api.js';

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(!getToken());
  const forget = useCallback(() => { setToken(''); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(forget);
    if (getToken()) api('/auth/me').then(setUser).catch(() => {}).finally(() => setReady(true));
  }, [forget]);

  const value = useMemo(() => {
    const enter = async (path, body) => {
      const r = await api(path, { method: 'POST', body });
      setToken(r.token);
      setUser(r.user);
    };
    return {
      user, ready,
      login: (email, password) => enter('/auth/login', { email, password }),
      register: (name, email, password) => enter('/auth/register', { name, email, password }),
      logout: () => { api('/auth/logout', { method: 'POST' }).catch(() => {}); forget(); }
    };
  }, [user, ready, forget]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
