import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Plus } from 'lucide-react';
import { fetchMyOrders } from '../../services/agent.service';
import { formatRwf } from '../../components/agent/StatCard';

const statusPill: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-600',
  pending: 'bg-amber-50 text-amber-600',
  failed: 'bg-red-50 text-red-600',
};

const AgentOrdersPage: React.FC = () => {
  const { data: orders, isLoading } = useQuery({ queryKey: ['agent-orders'], queryFn: fetchMyOrders, staleTime: 30 * 1000 });

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-display font-bold text-gray-900">My Orders</h1>
        <Link
          to="/agent/orders/new"
          className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-primary-200 transition-colors"
        >
          <Plus size={18} /> New Sale
        </Link>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-primary-600" size={28} /></div>
      )}

      {!isLoading && (!orders || orders.length === 0) && (
        <div className="bg-white rounded-2xl shadow-card p-10 text-center text-sm text-gray-500">
          You haven't recorded any sales yet.
        </div>
      )}

      {orders && orders.length > 0 && (
        <div className="bg-white rounded-2xl shadow-card overflow-hidden overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Order #</th>
                <th className="text-left px-5 py-3 font-medium">Total</th>
                <th className="text-left px-5 py-3 font-medium">Payment</th>
                <th className="text-left px-5 py-3 font-medium">Status</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-800 whitespace-nowrap">{o.orderNumber}</td>
                  <td className="px-5 py-3.5 text-gray-700">{formatRwf(o.totalRwf)}</td>
                  <td className="px-5 py-3.5 text-gray-500">{o.paymentMethod}</td>
                  <td className="px-5 py-3.5">
                    <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-medium ${statusPill[o.paymentStatus] || 'bg-gray-100 text-gray-500'}`}>
                      {o.paymentStatus}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-gray-500 hidden sm:table-cell whitespace-nowrap">
                    {o.createdAt ? new Date(o.createdAt).toLocaleDateString() : '—'}
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

export default AgentOrdersPage;
