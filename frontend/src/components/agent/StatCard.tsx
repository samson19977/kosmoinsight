import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface StatCardProps {
  label: string;
  value: string;
  icon: LucideIcon;
  tone?: 'primary' | 'secondary' | 'accent' | 'neutral';
}

const toneClasses: Record<NonNullable<StatCardProps['tone']>, string> = {
  primary: 'bg-primary-50 text-primary-600',
  secondary: 'bg-secondary-50 text-secondary-600',
  accent: 'bg-accent-50 text-accent-600',
  neutral: 'bg-gray-100 text-gray-600',
};

const StatCard: React.FC<StatCardProps> = ({ label, value, icon: Icon, tone = 'neutral' }) => (
  <div className="bg-white rounded-2xl shadow-card p-5 flex items-start justify-between">
    <div>
      <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-1">{label}</p>
      <p className="text-2xl font-display font-bold text-gray-900">{value}</p>
    </div>
    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${toneClasses[tone]}`}>
      <Icon size={20} />
    </div>
  </div>
);

export default StatCard;

export function formatRwf(n: number): string {
  return `${Math.round(n).toLocaleString()} FRW`;
}
