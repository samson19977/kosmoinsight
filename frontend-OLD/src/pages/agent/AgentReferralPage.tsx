import React from 'react';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import { Loader2, Link2, Copy, Share2 } from 'lucide-react';
import { fetchMyReferral } from '../../services/agent.service';

const AgentReferralPage: React.FC = () => {
  const { data, isLoading } = useQuery({ queryKey: ['agent-referral'], queryFn: fetchMyReferral });

  const copyLink = () => {
    if (!data) return;
    navigator.clipboard.writeText(data.referralUrl);
    toast.success('Referral link copied!');
  };

  return (
    <div>
      <div className="flex items-center gap-2 mb-6">
        <Link2 size={22} className="text-primary-600" />
        <h1 className="text-2xl font-display font-bold text-gray-900">My Referral Link</h1>
      </div>

      {isLoading && <div className="flex items-center justify-center py-24"><Loader2 className="animate-spin text-primary-600" size={28} /></div>}

      {data && (
        <div className="bg-white rounded-2xl shadow-card p-6 max-w-xl">
          <p className="text-sm text-gray-500 mb-4">
            Share this link — any order placed after a customer visits it is attributed to you, even if they browse
            around and check out later.
          </p>
          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Agent Code</p>
          <p className="text-lg font-display font-bold text-gray-900 mb-4">{data.agentCode}</p>

          <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">Referral Link</p>
          <div className="flex items-center gap-2 bg-gray-50 border border-gray-100 rounded-xl px-4 py-3">
            <span className="text-sm text-gray-700 truncate flex-1">{data.referralUrl}</span>
            <button onClick={copyLink} className="text-primary-600 hover:text-primary-700 shrink-0" aria-label="Copy link">
              <Copy size={16} />
            </button>
          </div>

          <button
            onClick={copyLink}
            className="w-full mt-5 inline-flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl shadow-lg shadow-primary-200 transition-colors"
          >
            <Share2 size={16} /> Copy link to share
          </button>
        </div>
      )}
    </div>
  );
};

export default AgentReferralPage;
