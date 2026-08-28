import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { UserPlus, Loader2, CheckCircle2, Eye, EyeOff } from 'lucide-react';
import { registerAgent } from '../../services/agent.service';

const RWANDAN_DISTRICTS = [
  'Bugesera', 'Burera', 'Gakenke', 'Gasabo', 'Gatsibo', 'Gicumbi', 'Gisagara', 'Huye',
  'Kamonyi', 'Karongi', 'Kayonza', 'Kicukiro', 'Kirehe', 'Muhanga', 'Musanze',
  'Ngoma', 'Ngororero', 'Nyabihu', 'Nyagatare', 'Nyamagabe', 'Nyamasheke',
  'Nyanza', 'Nyarugenge', 'Nyaruguru', 'Rubavu', 'Ruhango', 'Rulindo', 'Rusizi',
  'Rutsiro', 'Rwamagana',
];

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode; error?: string }> = ({ label, required, children, error }) => (
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
    {children}
    {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
  </div>
);

const inputCls = 'w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-white transition-all';

const initialForm = {
  firstName: '', lastName: '', phone: '', email: '', nationalId: '',
  district: '', sector: '', cell: '', village: '', password: '', confirmPassword: '',
};

const AgentRegisterPage: React.FC = () => {
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [success, setSuccess] = useState<{ agentCode: string; message: string } | null>(null);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!/^[A-Za-z\s\-]{2,}$/.test(form.firstName.trim())) errs.firstName = 'Letters only, at least 2 characters';
    if (!/^[A-Za-z\s\-]{2,}$/.test(form.lastName.trim())) errs.lastName = 'Letters only, at least 2 characters';
    if (!/^(\+250|0)[78][0-9]{8}$/.test(form.phone.trim())) errs.phone = 'Enter a valid Rwandan phone number';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) errs.email = 'Invalid email address';
    if (!/^[0-9]{16}$/.test(form.nationalId.trim())) errs.nationalId = 'National ID must be 16 digits';
    if (!form.district) errs.district = 'District is required';
    if (!form.sector.trim()) errs.sector = 'Sector is required';
    if (!form.cell.trim()) errs.cell = 'Cell is required';
    if (!form.village.trim()) errs.village = 'Village is required';
    if (form.password.length < 8) errs.password = 'At least 8 characters';
    if (form.password !== form.confirmPassword) errs.confirmPassword = 'Passwords do not match';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) { toast.error('Please fix the errors below'); return; }
    setLoading(true);
    try {
      const result = await registerAgent({
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        nationalId: form.nationalId.trim(),
        district: form.district,
        sector: form.sector.trim(),
        cell: form.cell.trim(),
        village: form.village.trim(),
        password: form.password,
        confirmPassword: form.confirmPassword,
      });
      setSuccess({ agentCode: result.agentCode, message: result.message });
    } catch (err: any) {
      toast.error(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-16">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-card p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
            <CheckCircle2 size={32} className="text-primary-600" />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Application received</h1>
          <p className="text-sm text-gray-500 mb-1">{success.message}</p>
          <p className="text-xs text-gray-400 mb-6">Your agent code: <span className="font-semibold text-gray-700">{success.agentCode}</span></p>
          <Link to="/agent/login" className="inline-block w-full bg-primary-600 hover:bg-primary-700 text-white font-semibold py-3 rounded-xl transition-colors">
            Go to Agent Login
          </Link>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <UserPlus size={32} className="text-primary-600" />
            </div>
            <h1 className="text-3xl font-display font-bold text-gray-900">Become an Agent</h1>
            <p className="text-gray-500 mt-2 text-sm">Your application will be reviewed before you can log in and start selling.</p>
          </div>

          {/* autoComplete="off" plus per-field overrides below: this form is
              often used on a shared/office device by multiple different
              agents registering one after another, so we don't want the
              browser offering to autofill a *previous* agent's saved email
              or password into a new registration. */}
          <form onSubmit={handleSubmit} autoComplete="off" className="bg-white rounded-2xl shadow-card p-6 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required error={errors.firstName}>
                <input className={inputCls} value={form.firstName} onChange={set('firstName')} placeholder="Jean" autoComplete="off" />
              </Field>
              <Field label="Last Name" required error={errors.lastName}>
                <input className={inputCls} value={form.lastName} onChange={set('lastName')} placeholder="Uwimana" autoComplete="off" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Phone" required error={errors.phone}>
                <input className={inputCls} value={form.phone} onChange={set('phone')} placeholder="0788123456" autoComplete="off" />
              </Field>
              <Field label="Email" required error={errors.email}>
                <input className={inputCls} type="email" autoComplete="off" value={form.email} onChange={set('email')} placeholder="you@example.com" />
              </Field>
            </div>
            <Field label="National ID" required error={errors.nationalId}>
              <input className={inputCls} value={form.nationalId} onChange={set('nationalId')} placeholder="16-digit National ID" maxLength={16} autoComplete="off" />
            </Field>

            <div className="grid grid-cols-2 gap-4">
              <Field label="District" required error={errors.district}>
                <select className={inputCls} value={form.district} onChange={set('district')}>
                  <option value="">Select district</option>
                  {RWANDAN_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Sector" required error={errors.sector}>
                <input className={inputCls} value={form.sector} onChange={set('sector')} autoComplete="off" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Field label="Cell" required error={errors.cell}>
                <input className={inputCls} value={form.cell} onChange={set('cell')} autoComplete="off" />
              </Field>
              <Field label="Village" required error={errors.village}>
                <input className={inputCls} value={form.village} onChange={set('village')} autoComplete="off" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Password" required error={errors.password}>
                <div className="relative">
                  <input className={`${inputCls} pr-11`} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.password} onChange={set('password')} placeholder="At least 8 characters" />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
              <Field label="Confirm Password" required error={errors.confirmPassword}>
                <div className="relative">
                  <input className={`${inputCls} pr-11`} type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={form.confirmPassword} onChange={set('confirmPassword')} />
                  <button type="button" onClick={() => setShowPassword((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600" tabIndex={-1} aria-label={showPassword ? 'Hide password' : 'Show password'}>
                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </Field>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-primary-200 transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <Loader2 className="animate-spin" size={18} /> : <UserPlus size={18} />}
              {loading ? 'Submitting…' : 'Create Agent Account'}
            </button>

            <p className="text-center text-sm text-gray-500">
              Already an agent? <Link to="/agent/login" className="text-primary-600 font-medium hover:underline">Log in</Link>
            </p>
          </form>
        </motion.div>
      </div>
    </div>
  );
};

export default AgentRegisterPage;
