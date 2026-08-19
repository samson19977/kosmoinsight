import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Plus, Search, Download } from 'lucide-react';
import { fetchMyOrders, downloadMyOrdersCsv } from '../../services/agent.service';
import { formatRwf } from '../../components/agent/StatCard';
import Pagination from '../../components/agent/Pagination';

const statusPill: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-600',
  pending: 'bg-amber-50 text-amber-600',
  failed: 'bg-red-50 text-red-600',
};

const PAGE_SIZE = 20;

const AgentOrdersPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['agent-orders', page, debouncedSearch],
    queryFn: () => fetchMyOrders({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  const orders = data?.data ?? [];

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadMyOrdersCsv(debouncedSearch || undefined);
    } catch (err: any) {
      toast.error(err.message || 'Failed to export orders');
    } finally {
      setExporting(false);
    }
  };

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

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            placeholder="Search by order #, customer, or phone"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || orders.length === 0}
          className="inline-flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          {exporting ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
          Export CSV
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-primary-600" size={28} /></div>
      )}

      {!isLoading && orders.length === 0 && (
        <div className="bg-white rounded-2xl shadow-card p-10 text-center text-sm text-gray-500">
          {debouncedSearch ? 'No orders match your search.' : "You haven't recorded any sales yet."}
        </div>
      )}

      {orders.length > 0 && (
        <div className={`bg-white rounded-2xl shadow-card overflow-hidden overflow-x-auto transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
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
          {data?.pagination && <Pagination pagination={data.pagination} onPageChange={setPage} />}
        </div>
      )}
    </div>
  );
};

export default AgentOrdersPage;
