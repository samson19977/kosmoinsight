import React, { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Search, UserPlus, X, Phone, MapPin, Download } from 'lucide-react';
import { fetchMyCustomers, createMyCustomer, downloadMyCustomersCsv, type NewCustomerInput } from '../../services/agent.service';
import Pagination from '../../components/agent/Pagination';

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-white transition-all';

const emptyForm: NewCustomerInput = { firstName: '', lastName: '', phone: '', email: '', nationalId: '', district: '', sector: '', cell: '', village: '' };

const NewCustomerModal: React.FC<{ onClose: () => void; onCreated: () => void }> = ({ onClose, onCreated }) => {
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const set = (k: keyof NewCustomerInput) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[A-Za-z\s\-]{2,}$/.test(form.firstName.trim()) || !/^[A-Za-z\s\-]{2,}$/.test(form.lastName.trim())) {
      toast.error('First and last name must be letters only'); return;
    }
    if (!/^(\+250|0)[78][0-9]{8}$/.test(form.phone.trim())) { toast.error('Enter a valid Rwandan phone number'); return; }
    setSaving(true);
    try {
      const result = await createMyCustomer({
        ...form,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email?.trim() || undefined,
        nationalId: form.nationalId?.trim() || undefined,
      });
      toast.success(result.reused ? 'Existing customer updated' : 'Customer registered');
      onCreated();
      onClose();
    } catch (err: any) {
      toast.error(err.message || 'Failed to register customer');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-display font-bold text-gray-900">Register Customer</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={20} /></button>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="First name *" value={form.firstName} onChange={set('firstName')} />
            <input className={inputCls} placeholder="Last name *" value={form.lastName} onChange={set('lastName')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Phone (07XXXXXXXX) *" value={form.phone} onChange={set('phone')} />
            <input className={inputCls} placeholder="Email" value={form.email} onChange={set('email')} />
          </div>
          <input className={inputCls} placeholder="National ID (16 digits, for PayGo)" value={form.nationalId} onChange={set('nationalId')} maxLength={16} />
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="District" value={form.district} onChange={set('district')} />
            <input className={inputCls} placeholder="Sector" value={form.sector} onChange={set('sector')} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Cell" value={form.cell} onChange={set('cell')} />
            <input className={inputCls} placeholder="Village" value={form.village} onChange={set('village')} />
          </div>
          <button type="submit" disabled={saving} className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-colors flex items-center justify-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <UserPlus size={16} />}
            {saving ? 'Saving…' : 'Register Customer'}
          </button>
        </form>
      </div>
    </div>
  );
};

const PAGE_SIZE = 20;

const AgentCustomersPage: React.FC = () => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Debounce the search box so every keystroke doesn't trigger a fetch —
  // resets back to page 1 whenever the search term actually changes.
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedSearch(search); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [search]);

  const { data, isLoading, isFetching } = useQuery({
    queryKey: ['agent-customers', page, debouncedSearch],
    queryFn: () => fetchMyCustomers({ page, pageSize: PAGE_SIZE, search: debouncedSearch || undefined }),
    staleTime: 30 * 1000,
    placeholderData: (prev) => prev,
  });

  const customers = data?.data ?? [];

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadMyCustomersCsv(debouncedSearch || undefined);
    } catch (err: any) {
      toast.error(err.message || 'Failed to export customers');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <h1 className="text-2xl font-display font-bold text-gray-900">My Customers</h1>
        <button
          onClick={() => setModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-5 py-2.5 rounded-xl shadow-md shadow-primary-200 transition-colors"
        >
          <UserPlus size={18} /> Register Customer
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
          <input
            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 bg-white"
            placeholder="Search by name, phone, or email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button
          onClick={handleExport}
          disabled={exporting || customers.length === 0}
          className="inline-flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 disabled:opacity-50 text-gray-700 font-medium px-4 py-2.5 rounded-xl text-sm transition-colors"
        >
          {exporting ? <Loader2 className="animate-spin" size={15} /> : <Download size={15} />}
          Export CSV
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-primary-600" size={28} /></div>
      )}

      {!isLoading && customers.length === 0 && (
        <div className="bg-white rounded-2xl shadow-card p-10 text-center text-sm text-gray-500">
          {debouncedSearch ? 'No customers match your search.' : "You haven't registered any customers yet."}
        </div>
      )}

      {customers.length > 0 && (
        <div className={`bg-white rounded-2xl shadow-card overflow-hidden transition-opacity ${isFetching ? 'opacity-60' : ''}`}>
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
              <tr>
                <th className="text-left px-5 py-3 font-medium">Customer</th>
                <th className="text-left px-5 py-3 font-medium">Phone</th>
                <th className="text-left px-5 py-3 font-medium hidden sm:table-cell">Location</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-800">{c.firstName} {c.lastName}</td>
                  <td className="px-5 py-3.5 text-gray-500"><span className="inline-flex items-center gap-1.5"><Phone size={13} />{c.phone}</span></td>
                  <td className="px-5 py-3.5 text-gray-500 hidden sm:table-cell">
                    {c.district ? <span className="inline-flex items-center gap-1.5"><MapPin size={13} />{c.district}{c.sector ? `, ${c.sector}` : ''}</span> : '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {data?.pagination && <Pagination pagination={data.pagination} onPageChange={setPage} />}
        </div>
      )}

      {modalOpen && (
        <NewCustomerModal
          onClose={() => setModalOpen(false)}
          onCreated={() => queryClient.invalidateQueries({ queryKey: ['agent-customers'] })}
        />
      )}
    </div>
  );
};

export default AgentCustomersPage;
