import React from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAgentAuth } from '../../context/AgentAuthContext';
import AgentLayout from './AgentLayout';

const AgentProtectedRoute: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { isAuthenticated, isLoading } = useAgentAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="animate-spin text-primary-600" size={32} />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/agent/login" replace />;
  }

  return <AgentLayout>{children}</AgentLayout>;
};

export default AgentProtectedRoute;
