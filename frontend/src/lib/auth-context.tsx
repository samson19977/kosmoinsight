"use client";
import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { api } from "@/lib/api";

interface User {
  id: number;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = localStorage.getItem("kosmo_user");
    if (stored) setUser(JSON.parse(stored));
    setLoading(false);
  }, []);

  const login = async (email: string, password: string) => {
    const data = await api.auth.login(email, password);
    if (data.access_token) {
      localStorage.setItem("kosmo_token", data.access_token);
      localStorage.setItem("kosmo_user", JSON.stringify(data.user));
      setUser(data.user);
    } else {
      throw new Error(data.detail || "Login failed");
    }
  };

  const logout = () => {
    localStorage.removeItem("kosmo_token");
    localStorage.removeItem("kosmo_user");
    setUser(null);
    window.location.href = "/login";
  };

  return <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
