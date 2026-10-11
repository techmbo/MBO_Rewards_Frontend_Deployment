import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { fetchApi, postApi, setAuthTokenGetter } from "../api";
import { clearSessionApiCache } from "../apiCache";
import { resetNavigationCacheWarmup, warmNavigationCache } from "../navigationCache";

const STORAGE_KEY = "mbo_auth_token";

const AuthContext = createContext(null);

function readStoredToken() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredToken(token) {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEY, token);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors in restricted environments.
  }
}

/**
 * TEMPORARY Preview auth bypass — REMOVE WHEN THE LOGIN FLOW IS USABLE AGAIN.
 *
 * The frontend deliberately holds no bypass flag of its own. It asks the backend, which answers
 * `active: false` in production regardless of how anything was built or configured, so a
 * production build can never skip login even by mistake.
 */
async function readDevBypassStatus() {
  try {
    const response = await fetchApi("/auth/dev-bypass-status");
    return response?.active === true;
  } catch {
    return false;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => readStoredToken());
  const [user, setUser] = useState(null);
  const [devBypass, setDevBypass] = useState(false);
  const [loading, setLoading] = useState(true);

  const clearSession = useCallback(() => {
    writeStoredToken(null);
    setToken(null);
    setUser(null);
    resetNavigationCacheWarmup();
    clearSessionApiCache();
  }, []);

  const applySession = useCallback((nextToken, nextUser) => {
    writeStoredToken(nextToken);
    setToken(nextToken);
    setUser(nextUser);
    warmNavigationCache({ isPortal: nextUser?.role === "CLIENT" });
  }, []);

  useEffect(() => {
    setAuthTokenGetter(() => token);
  }, [token]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      if (!token) {
        // No stored token. Ask the backend whether the Preview bypass is live; if it is, the
        // unauthenticated /auth/me call returns a synthetic ADMIN and we route straight in.
        const bypassActive = await readDevBypassStatus();
        if (!active) return;
        if (bypassActive) {
          try {
            const response = await fetchApi("/auth/me");
            if (!active) return;
            setUser(response.user);
            setDevBypass(true);
            setLoading(false);
            return;
          } catch {
            if (!active) return;
          }
        }
        setUser(null);
        setDevBypass(false);
        setLoading(false);
        return;
      }
      setDevBypass(false);

      try {
        const response = await fetchApi("/auth/me");
        if (!active) return;
        setUser(response.user);
        warmNavigationCache({ isPortal: response.user?.role === "CLIENT" });
      } catch {
        if (!active) return;
        clearSession();
      } finally {
        if (active) setLoading(false);
      }
    }

    setLoading(true);
    bootstrap();
    return () => {
      active = false;
    };
  }, [token, clearSession]);

  const login = useCallback(
    async ({ email, password }) => {
      const response = await postApi("/auth/login", { email, password });
      applySession(response.accessToken, response.user);
      return response;
    },
    [applySession],
  );

  const register = useCallback(
    async ({ email, password, name, verificationToken }) => {
      const response = await postApi("/auth/register", {
        email,
        password,
        name,
        verificationToken,
      });
      applySession(response.accessToken, response.user);
      return response;
    },
    [applySession],
  );

  const logout = useCallback(async () => {
    try {
      if (token) {
        await postApi("/auth/logout");
      }
    } catch {
      // Always clear local session even if the server call fails.
    } finally {
      clearSession();
    }
  }, [token, clearSession]);

  const refreshUser = useCallback(async () => {
    if (!token) return null;
    const response = await fetchApi("/auth/me");
    setUser(response.user);
    return response.user;
  }, [token]);

  const value = useMemo(
    () => ({
      user,
      token,
      loading,
      devBypass,
      // Under the Preview bypass there is no token by design, so authentication is carried by the
      // synthetic user the backend returned. Everywhere else a token is still required.
      isAuthenticated: Boolean(user && (token || devBypass)),
      login,
      register,
      logout,
      refreshUser,
    }),
    [user, token, loading, devBypass, login, register, logout, refreshUser],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
