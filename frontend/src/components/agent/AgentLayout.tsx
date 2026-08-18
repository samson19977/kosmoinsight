import React, { useState } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, Users, ShoppingBag, Wallet, Link2, UserCircle,
  Menu, X, LogOut, Leaf,
} from 'lucide-react';
import { useAgentAuth } from '../../context/AgentAuthContext';

const navItems = [
  { to: '/agent/dashboard', label: 'Overview', icon: LayoutDashboard, end: true },
  { to: '/agent/orders', label: 'My Orders', icon: ShoppingBag },
  { to: '/agent/customers', label: 'My Customers', icon: Users },
  { to: '/agent/commissions', label: 'Commissions & Payouts', icon: Wallet },
  { to: '/agent/referral', label: 'My Referral Link', icon: Link2 },
  { to: '/agent/profile', label: 'My Profile', icon: UserCircle },
];

const AgentLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { agent, logout } = useAgentAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/agent/login');
  };

  const navLinkCls = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
      isActive ? 'bg-primary-600 text-white shadow-md shadow-primary-200' : 'text-gray-600 hover:bg-primary-50 hover:text-primary-700'
    }`;

  const SidebarContent = (
    <>
      <Link to="/agent/dashboard" className="flex items-center gap-2 px-2 mb-8">
        <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-lg shadow-primary-200">
          <Leaf size={18} className="text-white" />
        </div>
        <div className="leading-none">
          <span className="font-display font-bold text-gray-900 text-lg">Kosmo<span className="text-primary-600">Agent</span></span>
          <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">Agent Portal</p>
        </div>
      </Link>

      <nav className="flex-1 space-y-1">
        {navItems.map((item) => (
          <NavLink key={item.to} to={item.to} end={item.end} className={navLinkCls}>
            <item.icon size={18} />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="mt-6 pt-6 border-t border-gray-100">
        <div className="px-4 mb-3">
          <p className="text-sm font-semibold text-gray-800 truncate">{agent?.name}</p>
          <p className="text-xs text-gray-400">{agent?.code}</p>
        </div>
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-sm font-medium text-gray-500 hover:bg-red-50 hover:text-red-600 transition-colors w-full"
        >
          <LogOut size={18} />
          Log out
        </button>
      </div>
    </>
  );

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Desktop sidebar */}
      <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-gray-100 px-4 py-6 sticky top-0 h-screen">
        {SidebarContent}
      </aside>

      {/* Mobile top bar + drawer */}
      <div className="lg:hidden fixed top-0 left-0 right-0 z-40 bg-white border-b border-gray-100 h-16 flex items-center justify-between px-4">
        <Link to="/agent/dashboard" className="flex items-center gap-2">
          <div className="w-8 h-8 bg-gradient-to-br from-primary-500 to-primary-700 rounded-lg flex items-center justify-center">
            <Leaf size={14} className="text-white" />
          </div>
          <span className="font-display font-bold text-gray-900">Kosmo<span className="text-primary-600">Agent</span></span>
        </Link>
        <button onClick={() => setMobileOpen(true)} className="p-2 text-gray-600" aria-label="Open menu">
          <Menu size={22} />
        </button>
      </div>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div className="absolute inset-0 bg-black/50" onClick={() => setMobileOpen(false)} />
          <aside className="relative w-72 bg-white h-full flex flex-col px-4 py-6 shadow-2xl">
            <button onClick={() => setMobileOpen(false)} className="absolute top-4 right-4 p-2 text-gray-400" aria-label="Close menu">
              <X size={20} />
            </button>
            {SidebarContent}
          </aside>
        </div>
      )}

      <main className="flex-1 min-w-0 pt-16 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">{children}</div>
      </main>
    </div>
  );
};

export default AgentLayout;
