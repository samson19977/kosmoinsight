import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus, Wallet, ShoppingBag, Users, TrendingUp, CalendarDays, CalendarRange, PiggyBank, CheckCircle2, Landmark, AlertCircle } from 'lucide-react';
import { fetchMyDashboard } from '../../services/agent.service';
import { useAgentAuth } from '../../context/AgentAuthContext';
import StatCard, { formatRwf } from '../../components/agent/StatCard';

const AgentDashboardPage: React.FC = () => {
  const { agent } = useAgentAuth();
  const { data, isLoading, error } = useQuery({
    queryKey: ['agent-dashboard'],
    queryFn: fetchMyDashboard,
    staleTime: 60 * 1000,
  });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Welcome back, {agent?.name?.split(' ')[0]}</h1>
          <p className="text-sm text-gray-500 mt-1">Agent code <span className="font-medium text-gray-700">{agent?.code}</span></p>
        </div>
        <Link
          to="/agent/orders/new"
          className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-5 py-3 rounded-xl shadow-lg shadow-primary-200 transition-colors"
        >
          <Plus size={18} /> New Sale
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24">
          <Loader2 className="animate-spin text-primary-600" size={28} />
        </div>
      )}

      {!isLoading && error && (
        <div className="bg-red-50 border border-red-100 text-red-600 text-sm rounded-2xl p-6 flex items-center gap-2">
          <AlertCircle size={18} /> Couldn't load your dashboard. Try refreshing the page.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            <StatCard label="Today's Sales" value={formatRwf(data.salesToday)} icon={CalendarDays} tone="primary" />
            <StatCard label="Last 7 Days" value={formatRwf(data.salesLast7Days)} icon={CalendarRange} tone="primary" />
            <StatCard label="Last 30 Days" value={formatRwf(data.salesLast30Days)} icon={TrendingUp} tone="primary" />
            <StatCard label="Total Sales" value={formatRwf(data.salesTotal)} icon={Wallet} tone="primary" />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Customers" value={String(data.customerCount)} icon={Users} tone="secondary" />
            <StatCard label="Orders" value={String(data.orderCount)} icon={ShoppingBag} tone="secondary" />
            <StatCard label="Pending Commission" value={formatRwf(data.pendingCommissionRwf)} icon={PiggyBank} tone="accent" />
            <StatCard label="Paid Commission" value={formatRwf(data.paidCommissionRwf)} icon={CheckCircle2} tone="accent" />
          </div>
          <div className="grid grid-cols-2 gap-4 mt-4">
            <StatCard label="Active PayGo Loans" value={String(data.activePayGoLoans)} icon={Landmark} tone="neutral" />
            <StatCard label="PayGo Outstanding" value={formatRwf(data.payGoOutstandingRwf)} icon={Landmark} tone="neutral" />
          </div>

          <div className="grid sm:grid-cols-3 gap-4 mt-8">
            <Link to="/agent/customers" className="bg-white rounded-2xl shadow-card p-5 hover:shadow-card-hover transition-shadow">
              <Users className="text-primary-600 mb-2" size={20} />
              <p className="font-display font-semibold text-gray-900">My Customers</p>
              <p className="text-xs text-gray-500 mt-1">Search, register, and review customer history.</p>
            </Link>
            <Link to="/agent/orders" className="bg-white rounded-2xl shadow-card p-5 hover:shadow-card-hover transition-shadow">
              <ShoppingBag className="text-primary-600 mb-2" size={20} />
              <p className="font-display font-semibold text-gray-900">My Orders</p>
              <p className="text-xs text-gray-500 mt-1">Every sale you've recorded, cash, MoMo, or PayGo.</p>
            </Link>
            <Link to="/agent/referral" className="bg-white rounded-2xl shadow-card p-5 hover:shadow-card-hover transition-shadow">
              <TrendingUp className="text-primary-600 mb-2" size={20} />
              <p className="font-display font-semibold text-gray-900">My Referral Link</p>
              <p className="text-xs text-gray-500 mt-1">Share it — orders placed through it are yours.</p>
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

export default AgentDashboardPage;
