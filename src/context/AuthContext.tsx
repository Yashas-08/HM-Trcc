import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, getStoredToken, setStoredToken } from '../lib/api';
import type { AuthUser, ModuleKey, PermissionAction } from '../types';

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  can: (moduleKey: ModuleKey, action?: PermissionAction) => boolean;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshUser = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }
    try {
      const res = await api.get<{ user: AuthUser }>('/api/auth/me');
      setUser(res.user);
    } catch {
      setStoredToken(null);
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUser();
    const onExpired = () => {
      setUser(null);
    };
    window.addEventListener('hm-auth-expired', onExpired);
    return () => window.removeEventListener('hm-auth-expired', onExpired);
  }, [refreshUser]);

  const login = async (email: string, password: string, rememberMe = true) => {
    const res = await api.post<{ token: string; user: AuthUser }>('/api/auth/login', {
      email,
      password,
    });
    setStoredToken(res.token, rememberMe);
    setUser(res.user);
  };

  const logout = () => {
    setStoredToken(null);
    setUser(null);
  };

  const can = useCallback(
    (moduleKey: ModuleKey, action: PermissionAction = 'view') => {
      if (!user) return false;
      if (user.role === 'super_admin') return true;
      return (user.permissions?.[moduleKey] || []).includes(action);
    },
    [user],
  );

  return (
    <AuthContext.Provider value={{ user, loading, login, logout, refreshUser, can }}>
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

