import React, { useState, useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ShoppingCart, Menu, X, Leaf } from 'lucide-react';
import { useCart } from '../../context/CartContext';
import { motion, AnimatePresence } from 'framer-motion';

const Header: React.FC = () => {
  const { totalItems, openCart } = useCart();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => setMenuOpen(false), [location]);

  const navClass = ({ isActive }: { isActive: boolean }) =>
    `text-sm font-medium transition-colors ${isActive ? 'text-primary-600' : 'text-gray-700 hover:text-primary-600'}`;

  return (
    <header className={`sticky top-0 z-30 transition-all duration-300 ${scrolled ? 'bg-white/95 backdrop-blur-md shadow-soft' : 'bg-white border-b border-gray-100'}`}>
      <div className="container mx-auto px-4 h-16 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2 group">
          <div className="w-9 h-9 bg-gradient-to-br from-primary-500 to-primary-700 rounded-xl flex items-center justify-center shadow-lg shadow-primary-200 group-hover:scale-105 transition-transform">
            <Leaf size={18} className="text-white" />
          </div>
          <div className="leading-none">
            <span className="font-display font-bold text-gray-900 text-lg">Kosmo<span className="text-primary-600">Pads</span></span>
            <p className="text-[10px] text-gray-400 font-medium tracking-wide uppercase">Rwanda</p>
          </div>
        </Link>

        {/* Desktop Nav */}
        <nav className="hidden md:flex items-center gap-8">
          <NavLink to="/" end className={navClass}>Home</NavLink>
          <NavLink to="/products" className={navClass}>Products</NavLink>
          <NavLink to="/order-status" className={navClass}>Track Order</NavLink>
          <NavLink to="/my-loan" className={navClass}>My PayGo Loan</NavLink>
          <NavLink to="/become-an-agent" className={navClass}>Become an Agent</NavLink>
          <NavLink to="/contact" className={navClass}>Contact</NavLink>
        </nav>

        {/* Actions */}
        <div className="flex items-center gap-3">
          <Link to="/products" className="hidden md:inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-4 py-2 rounded-lg text-sm font-semibold transition-all hover:scale-105 shadow-lg shadow-primary-200">
            Shop Now
          </Link>
          <button
            onClick={openCart}
            className="relative p-2.5 bg-gray-100 hover:bg-primary-50 rounded-xl transition-colors group"
            aria-label="Open cart"
          >
            <ShoppingCart size={20} className="text-gray-700 group-hover:text-primary-600 transition-colors" />
            {totalItems > 0 && (
              <motion.span
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute -top-1 -right-1 bg-primary-600 text-white text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold"
              >
                {totalItems > 9 ? '9+' : totalItems}
              </motion.span>
            )}
          </button>
          <button onClick={() => setMenuOpen((v) => !v)} className="md:hidden p-2.5 bg-gray-100 rounded-xl transition-colors hover:bg-gray-200">
            {menuOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {menuOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="md:hidden bg-white border-t border-gray-100 px-4 py-4 space-y-1"
          >
            {[['/', 'Home'], ['/products', 'Products'], ['/order-status', 'Track Order'], ['/my-loan', 'My PayGo Loan'], ['/become-an-agent', 'Become an Agent'], ['/contact', 'Contact']].map(([to, label]) => (
              <NavLink key={to} to={to} end={to === '/'} className={({ isActive }) =>
                `block px-4 py-3 rounded-xl text-sm font-medium transition-colors ${isActive ? 'bg-primary-50 text-primary-700' : 'text-gray-700 hover:bg-gray-50'}`
              }>{label}</NavLink>
            ))}
            <Link to="/products" className="block mt-2 bg-primary-600 text-white text-center py-3 rounded-xl font-semibold">Shop Now</Link>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  );
};

export default Header;
