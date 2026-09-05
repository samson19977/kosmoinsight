import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

interface BackButtonProps {
  // Where to go if there's no real browser history to go back to (e.g.
  // someone opened this page directly from a shared link, not by
  // clicking through the site) — falls back here instead of leaving
  // the button doing nothing or navigating somewhere confusing.
  fallback?: string;
  label?: string;
  className?: string;
}

// ============================================
// Used across every "utility" page (Contact, PayGo info, My Loan, Order
// Status, agent login/register) so a person who followed a link in
// (say a WhatsApp message, or clicked a footer link) always has an
// obvious, consistent way back — instead of being stuck on a page with
// only the browser's own back button as an option.
// ============================================
const BackButton: React.FC<BackButtonProps> = ({ fallback = '/', label = 'Back', className = '' }) => {
  const navigate = useNavigate();

  const handleBack = () => {
    // window.history.state.idx > 0 means there's actually somewhere to go
    // back to within this app (not just landing here fresh) — otherwise
    // browser back could exit the site entirely or land somewhere odd.
    if (window.history.state && window.history.state.idx > 0) {
      navigate(-1);
    } else {
      navigate(fallback);
    }
  };

  return (
    <button
      onClick={handleBack}
      className={`inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary-600 transition-colors mb-4 ${className}`}
    >
      <ArrowLeft size={16} /> {label}
    </button>
  );
};

export default BackButton;
