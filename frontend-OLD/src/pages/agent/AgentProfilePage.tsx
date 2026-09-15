import React from 'react';
import { UserCircle } from 'lucide-react';
import { useAgentAuth } from '../../context/AgentAuthContext';

const Row: React.FC<{ label: string; value?: string | null }> = ({ label, value }) => (
  <div className="flex justify-between py-3 border-b border-gray-100 last:border-0">
    <span className="text-sm text-gray-500">{label}</span>
    <span className="text-sm font-medium text-gray-800">{value || '—'}</span>
  </div>
);

const statusLabel: Record<string, string> = {
  active: 'Active', approved: 'Approved', pending: 'Pending Approval', suspended: 'Suspended', rejected: 'Rejected',
};

const AgentProfilePage: React.FC = () => {
  const { agent } = useAgentAuth();

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <UserCircle size={22} className="text-primary-600" />
        <h1 className="text-2xl font-display font-bold text-gray-900">My Profile</h1>
      </div>

      <div className="bg-white rounded-2xl shadow-card p-6 max-w-xl">
        <Row label="Name" value={agent?.name} />
        <Row label="Agent Code" value={agent?.code} />
        <Row label="Phone" value={agent?.phone} />
        <Row label="Email" value={agent?.email} />
        <Row label="Status" value={agent ? statusLabel[agent.status] ?? agent.status : undefined} />
        <Row label="Commission Rate" value={agent ? `${(agent.commissionRateBps / 100).toFixed(1)}%` : undefined} />
        <Row label="District" value={agent?.district} />
        <Row label="Sector" value={agent?.sector} />
        <Row label="Cell" value={agent?.cell} />
        <Row label="Village" value={agent?.village} />
      </div>
      <p className="text-xs text-gray-400 mt-4">
        Your commission rate is set by Kosmotive and can't be changed here. Contact Kosmotive support to update your details.
      </p>
    </div>
  );
};

export default AgentProfilePage;
