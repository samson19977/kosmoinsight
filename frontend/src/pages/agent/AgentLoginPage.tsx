import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { LogIn, Loader2, Leaf, Eye, EyeOff } from 'lucide-react';
import BackButton from '../../components/common/BackButton';
import { useAgentAuth } from '../../context/AgentAuthContext';

const inputCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-white transition-all';

const AgentLoginPage: React.FC = () => {
  const navigate = useNavigate();
  const { login } = useAgentAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!identifier.trim() || !password) { toast.error('Enter your phone/email and password'); return; }
    setLoading(true);
    try {
      await login(identifier.trim(), password);
      toast.success('Welcome back!');
      navigate('/agent/dashboard');
    } catch (err: any) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-12">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-sm">
        <BackButton fallback="/" label="Back to KosmoPads" />
        <div className="text-center mb-8">
          <div className="w-14 h-14 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg shadow-primary-200">
            <Leaf size={24} className="text-white" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Agent Login</h1>
          <p className="text-gray-500 mt-1.5 text-sm">Log in to your Kosmotive agent dashboard.</p>
        </div>

        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-card p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Phone or Email</label>
            <input className={inputCls} value={identifier} onChange={(e) => setIdentifier(e.target.value)} placeholder="0788123456 or you@example.com" autoComplete="username" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-1.5">Password</label>
            <div className="relative">
              <input
                className={`${inputCls} pr-11`}
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-primary-200 transition-colors flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <LogIn size={18} />}
            {loading ? 'Logging in…' : 'Log In'}
          </button>
          <p className="text-center text-sm text-gray-500">
            Not an agent yet? <Link to="/agent/register" className="text-primary-600 font-medium hover:underline">Apply here</Link>
          </p>
        </form>
      </motion.div>
    </div>
  );
};

export default AgentLoginPage;
