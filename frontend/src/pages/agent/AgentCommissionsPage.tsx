import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Wallet } from 'lucide-react';
import { fetchMyCommissions, fetchMyPayouts } from '../../services/agent.service';
import { formatRwf } from '../../components/agent/StatCard';

const statusPill: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-600',
  approved: 'bg-blue-50 text-blue-600',
  paid: 'bg-emerald-50 text-emerald-600',
  rejected: 'bg-red-50 text-red-600',
  cancelled: 'bg-gray-100 text-gray-500',
};

const AgentCommissionsPage: React.FC = () => {
  const [tab, setTab] = useState<'commissions' | 'payouts'>('commissions');
  const { data: commissions, isLoading: loadingCommissions } = useQuery({ queryKey: ['agent-commissions'], queryFn: fetchMyCommissions });
  const { data: payouts, isLoading: loadingPayouts } = useQuery({ queryKey: ['agent-payouts'], queryFn: fetchMyPayouts, enabled: tab === 'payouts' });

  const rows = tab === 'commissions' ? commissions : payouts;
  const isLoading = tab === 'commissions' ? loadingCommissions : loadingPayouts;

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Wallet size={22} className="text-primary-600" />
        <h1 className="text-2xl font-display font-bold text-gray-900">Commissions & Payouts</h1>
      </div>

      <div className="flex gap-2 mb-5">
        <button onClick={() => setTab('commissions')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'commissions' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          All Commissions
        </button>
        <button onClick={() => setTab('payouts')} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === 'payouts' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>
          Paid Payouts
        </button>
      </div>

      {isLoading && <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-primary-600" size={28} /></div>}

      {!isLoading && (!rows || rows.length === 0) && (
        <div className="bg-white rounded-2xl shadow-card p-10 text-center text-sm text-gray-500">
          {tab === 'commissions' ? "You haven't earned any commission yet." : 'No payouts recorded yet.'}
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Order</th>
                <th className="text-left px-5 py-3 font-medium">Sale Amount</th>
                <th className="text-left px-5 py-3 font-medium">Commission</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {rows.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-800">#{c.orderId}</td>
                  <td className="px-5 py-3.5 text-gray-500">{formatRwf(c.saleAmountRwf)}</td>
                  <td className="px-5 py-3.5 text-gray-800 font-medium">{formatRwf(c.commissionRwf)}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusPill[c.status] || 'bg-gray-100 text-gray-500'}`}>{c.status}</span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                    {(tab === 'payouts' ? c.paidAt : c.createdAt) ? new Date((tab === 'payouts' ? c.paidAt : c.createdAt) as string).toLocaleDateString() : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default AgentCommissionsPage;
