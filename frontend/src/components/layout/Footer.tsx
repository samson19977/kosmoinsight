import React from 'react';
import { Link } from 'react-router-dom';
import { Leaf, Mail, Phone, MapPin, Heart } from 'lucide-react';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const ADMIN_DASHBOARD_URL = `${API_URL.replace(/\/api\/?$/, '')}/admin`;

const Footer: React.FC = () => (
  <footer className="bg-gray-900 text-gray-300">
    <div className="container mx-auto px-4 py-12">
      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        {/* Brand */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-2 mb-4">
            <div className="w-9 h-9 bg-primary-600 rounded-xl flex items-center justify-center">
              <Leaf size={18} className="text-white" />
            </div>
            <span className="font-display font-bold text-white text-lg">Kosmo<span className="text-primary-400">Pads</span></span>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed max-w-sm">
            Quality, eco-friendly menstrual pads for Rwandan women. Supporting dignity, sustainability, and women's health across Rwanda.
          </p>
          <div className="mt-5 space-y-2 text-sm">
            <a href="mailto:digital@kosmotive.example" className="flex items-center gap-2 text-gray-400 hover:text-primary-400 transition-colors">
              <Mail size={14} /><span>digital@kosmotive.example</span>
            </a>
            <a href="tel:+250788536350" className="flex items-center gap-2 text-gray-400 hover:text-primary-400 transition-colors">
              <Phone size={14} /><span>+250 788 536 350</span>
            </a>
            <div className="flex items-center gap-2 text-gray-400">
              <MapPin size={14} /><span>Kigali, Rwanda</span>
            </div>
          </div>
        </div>

        {/* Links */}
        <div>
          <h4 className="text-white font-semibold mb-4">Quick Links</h4>
          <ul className="space-y-2 text-sm">
            {[['/', 'Home'], ['/products', 'Products'], ['/checkout', 'Checkout'], ['/order-status', 'Track Order'], ['/my-loan', 'My PayGo Loan'], ['/become-an-agent', 'Become an Agent'], ['/contact', 'Contact']].map(([to, label]) => (
              <li key={to}><Link to={to} className="text-gray-400 hover:text-primary-400 transition-colors">{label}</Link></li>
            ))}
          </ul>
        </div>

        {/* Payment */}
        <div>
          <h4 className="text-white font-semibold mb-4">Payment</h4>
          <div className="space-y-3 text-sm">
            <div className="bg-gray-800 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">MTN MoMo USSD</p>
              <p className="text-white font-mono font-bold">*182*8*1*675566#</p>
            </div>
            <div className="bg-gray-800 rounded-xl p-3">
              <p className="text-gray-400 text-xs mb-1">Merchant Code</p>
              <p className="text-white font-mono font-bold">675566</p>
            </div>
            <p className="text-xs text-gray-500">Also accept: Cash on delivery</p>
          </div>
        </div>
      </div>

      <div className="border-t border-gray-800 mt-10 pt-6 flex flex-col md:flex-row items-center justify-between gap-3 text-xs text-gray-500">
        <p>© 2026 Kosmotive. All rights reserved.</p>
        <p className="flex items-center gap-1">Made with <Heart size={12} className="text-red-400 fill-red-400" /> for Rwandan women</p>
        <a href={ADMIN_DASHBOARD_URL} target="_blank" rel="noopener noreferrer" className="text-gray-600 hover:text-gray-400 transition-colors">
          Admin
        </a>
      </div>
    </div>
  </footer>
);

export default Footer;
