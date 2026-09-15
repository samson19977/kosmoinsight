import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  type Agent,
  getAgentToken,
  setAgentToken,
  clearAgentToken,
  loginAgent,
  fetchMyAgent,
} from '../services/agent.service';

interface AgentAuthContextType {
  agent: Agent | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (identifier: string, password: string) => Promise<Agent>;
  logout: () => void;
  refreshAgent: () => Promise<void>;
}

const AgentAuthContext = createContext<AgentAuthContextType | undefined>(undefined);

export const AgentAuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agent, setAgent] = useState<Agent | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refreshAgent = async () => {
    const token = getAgentToken();
    if (!token) {
      setAgent(null);
      setIsLoading(false);
      return;
    }
    try {
      const me = await fetchMyAgent();
      setAgent(me);
    } catch {
      // Token invalid/expired or agent no longer active — clear it.
      clearAgentToken();
      setAgent(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refreshAgent();
  }, []);

  const login = async (identifier: string, password: string) => {
    const { token, agent: loggedInAgent } = await loginAgent(identifier, password);
    setAgentToken(token);
    setAgent(loggedInAgent);
    return loggedInAgent;
  };

  const logout = () => {
    clearAgentToken();
    setAgent(null);
  };

  return (
    <AgentAuthContext.Provider value={{ agent, isLoading, isAuthenticated: !!agent, login, logout, refreshAgent }}>
      {children}
    </AgentAuthContext.Provider>
  );
};

export function useAgentAuth() {
  const ctx = useContext(AgentAuthContext);
  if (!ctx) throw new Error('useAgentAuth must be used within AgentAuthProvider');
  return ctx;
}
