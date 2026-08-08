import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useCart } from '../context/CartContext';
import { createOrder } from '../services/orders.service';
import { initiateMomoPayment } from '../services/payment.service';
import toast from 'react-hot-toast';
import { Phone, CreditCard, ArrowLeft, CheckCircle, Loader2, ShieldCheck } from 'lucide-react';

const RWANDAN_DISTRICTS = [
  'Bugesera','Burera','Gakenke','Gasabo','Gatsibo','Gicumbi','Gisagara','Huye',
  'Kamonyi','Karongi','Kayonza','Kicukiro','Kirehe','Muhanga','Musanze',
  'Ngoma','Ngororero','Nyabihu','Nyagatare','Nyamagabe','Nyamasheke',
  'Nyanza','Nyarugenge','Nyaruguru','Rubavu','Ruhango','Rulindo','Rusizi',
  'Rutsiro','Rwamagana',
];

const Field: React.FC<{ label: string; required?: boolean; children: React.ReactNode; hint?: string }> = ({ label, required, children, hint }) => (
  <div>
    <label className="block text-sm font-semibold text-gray-700 mb-1.5">{label}{required && <span className="text-red-500 ml-0.5">*</span>}</label>
    {children}
    {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
  </div>
);

const inputCls = "w-full px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-white transition-all";

const CheckoutPage: React.FC = () => {
  const navigate = useNavigate();
  const { items, totalPrice, clearCart } = useCart();
  const [loading, setLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<'momo' | 'cash'>('momo');
  const [form, setForm] = useState({ firstName: '', lastName: '', email: '', phone: '', district: '', village: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => { if (items.length === 0) navigate('/products'); }, [items, navigate]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    setForm((f) => ({ ...f, [k]: e.target.value }));
    setErrors((er) => ({ ...er, [k]: '' }));
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!/^[A-Za-z\s\-]{2,}$/.test(form.firstName.trim())) errs.firstName = 'First name must be at least 2 letters only';
    if (!/^[A-Za-z\s\-]{2,}$/.test(form.lastName.trim())) errs.lastName = 'Last name must be at least 2 letters only';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = 'Invalid email address';
    if (!/^(\+250|0)[78][0-9]{8}$/.test(form.phone.trim())) errs.phone = 'Enter a valid Rwandan phone number';
    if (!form.district) errs.district = 'Please select a district';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) { toast.error('Please fix the errors below'); return; }
    if (totalPrice < 2000) { toast.error('Minimum order is 2,000 FRW'); return; }

    setLoading(true);
    try {
      const payload = {
        customer: { firstName: form.firstName.trim(), lastName: form.lastName.trim(), email: form.email || undefined, phone: form.phone.trim(), district: form.district, village: form.village || undefined },
        items: items.map((i) => ({ name: i.name, quantity: i.quantity, price: i.price, productId: i.id })),
        paymentMethod: paymentMethod === 'momo' ? 'Mobile Money (MTN / Airtel)' : 'Cash on Delivery',
        notes: form.notes || undefined,
      };

      const result = await createOrder(payload as any);
      if (!result.success) throw new Error(result.error || 'Order failed');

      // Attempt MoMo push (non-fatal if fails)
      if (paymentMethod === 'momo') {
        try {
          await initiateMomoPayment({ phone: form.phone.trim(), amount: totalPrice, reference: result.orderNumber, description: `KosmoPads Order #${result.orderNumber}` });
          toast.success('Check your phone — MoMo prompt sent!');
        } catch { /* silent — manual USSD fallback shown on confirmation page */ }
      }

      clearCart();
      navigate(`/order-confirmation/${result.orderNumber}`, {
        state: { orderNumber: result.orderNumber, total: totalPrice, paymentInstructions: result.paymentInstructions, customerName: `${form.firstName} ${form.lastName}` },
      });
    } catch (err: any) {
      toast.error(err.message || 'Failed to create order. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-5xl">
        {/* Back */}
        <button onClick={() => navigate('/products')} className="flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors mb-6 text-sm font-medium">
          <ArrowLeft size={18} /> Continue Shopping
        </button>

        <div className="grid md:grid-cols-5 gap-8 items-start">
          {/* ── Form ── */}
          <motion.form
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            onSubmit={handleSubmit}
            className="md:col-span-3 bg-white rounded-2xl shadow-card p-6 space-y-5"
          >
            <div className="border-b border-gray-100 pb-4 mb-2">
              <h1 className="text-2xl font-display font-bold text-gray-900">Checkout</h1>
              <p className="text-sm text-gray-400 mt-0.5">Fill in your details to place your order</p>
            </div>

            {/* Name */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="First Name" required>
                <input type="text" value={form.firstName} onChange={set('firstName')} placeholder="Amina" className={`${inputCls} ${errors.firstName ? 'border-red-400 focus:ring-red-300' : ''}`} />
                {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
              </Field>
              <Field label="Last Name" required>
                <input type="text" value={form.lastName} onChange={set('lastName')} placeholder="Uwase" className={`${inputCls} ${errors.lastName ? 'border-red-400 focus:ring-red-300' : ''}`} />
                {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
              </Field>
            </div>

            {/* Email */}
            <Field label="Email Address" hint="Optional — we'll send your order confirmation here">
              <input type="email" value={form.email} onChange={set('email')} placeholder="amina@example.com" className={`${inputCls} ${errors.email ? 'border-red-400' : ''}`} />
              {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
            </Field>

            {/* Phone */}
            <Field label="Phone Number" required hint="Rwandan format: 0788123456 or +250788123456">
              <div className="flex">
                <span className="inline-flex items-center px-4 bg-gray-100 border border-r-0 border-gray-200 rounded-l-xl text-sm text-gray-500 font-medium">🇷🇼 +250</span>
                <input type="tel" value={form.phone} onChange={set('phone')} placeholder="788536350" className={`flex-1 px-4 py-3 border rounded-r-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 transition-all ${errors.phone ? 'border-red-400' : 'border-gray-200'}`} />
              </div>
              {errors.phone && <p className="text-xs text-red-500 mt-1">{errors.phone}</p>}
            </Field>

            {/* District & Village */}
            <div className="grid grid-cols-2 gap-4">
              <Field label="District" required>
                <select value={form.district} onChange={set('district')} className={`${inputCls} ${errors.district ? 'border-red-400' : ''}`}>
                  <option value="">Select district</option>
                  {RWANDAN_DISTRICTS.map((d) => <option key={d} value={d}>{d}</option>)}
                </select>
                {errors.district && <p className="text-xs text-red-500 mt-1">{errors.district}</p>}
              </Field>
              <Field label="Village / Sector" hint="Optional">
                <input type="text" value={form.village} onChange={set('village')} placeholder="Kimironko" className={inputCls} />
              </Field>
            </div>

            {/* Notes */}
            <Field label="Additional Notes" hint="Optional — special instructions or delivery notes">
              <textarea value={form.notes} onChange={set('notes')} rows={3} placeholder="Any special instructions..." className={`${inputCls} resize-none`} />
            </Field>

            {/* Payment Method */}
            <div>
              <p className="text-sm font-semibold text-gray-700 mb-3">Payment Method</p>
              <div className="grid grid-cols-2 gap-3">
                {([['momo', 'Mobile Money', 'MTN / Airtel', Phone], ['cash', 'Cash', 'Pay at pickup', CreditCard]] as const).map(([val, label, sub, Icon]) => (
                  <button key={val} type="button" onClick={() => setPaymentMethod(val)}
                    className={`p-4 border-2 rounded-xl text-left transition-all ${paymentMethod === val ? 'border-primary-500 bg-primary-50 shadow-md' : 'border-gray-200 hover:border-gray-300 bg-white'}`}
                  >
                    <Icon className={`mb-2 ${paymentMethod === val ? 'text-primary-600' : 'text-gray-400'}`} size={22} />
                    <p className="text-sm font-semibold text-gray-900">{label}</p>
                    <p className="text-xs text-gray-400">{sub}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Security badge */}
            <div className="flex items-center gap-2 text-xs text-gray-400 bg-gray-50 rounded-xl p-3">
              <ShieldCheck size={16} className="text-primary-500 flex-shrink-0" />
              <span>Your information is safe. We only use it to process your order.</span>
            </div>

            {/* Submit */}
            <button type="submit" disabled={loading}
              className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white py-4 rounded-xl font-bold text-base transition-all hover:scale-[1.02] shadow-lg shadow-primary-200 flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 size={20} className="animate-spin" /> Processing...</> : <><CheckCircle size={20} /> Place Order — {totalPrice.toLocaleString()} FRW</>}
            </button>
          </motion.form>

          {/* ── Order Summary ── */}
          <motion.div initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.15 }} className="md:col-span-2">
            <div className="bg-white rounded-2xl shadow-card p-5 sticky top-20">
              <h2 className="font-display font-bold text-gray-900 mb-4">Order Summary</h2>

              <div className="space-y-3 max-h-60 overflow-y-auto pr-1 mb-4">
                {items.map((item) => (
                  <div key={item.id} className="flex justify-between items-center text-sm py-1 border-b border-gray-50 last:border-0">
                    <span className="text-gray-700 font-medium">{item.name} <span className="text-gray-400">× {item.quantity}</span></span>
                    <span className="font-semibold text-gray-900">{(item.price * item.quantity).toLocaleString()} FRW</span>
                  </div>
                ))}
              </div>

              <div className="border-t border-gray-100 pt-4 space-y-2 text-sm">
                <div className="flex justify-between text-gray-500"><span>Subtotal</span><span className="font-medium text-gray-900">{totalPrice.toLocaleString()} FRW</span></div>
                <div className="flex justify-between text-gray-400 text-xs"><span>Delivery</span><span>Paid by client separately</span></div>
                <div className="flex justify-between font-bold text-base border-t pt-2 mt-2">
                  <span>Total</span>
                  <span className="text-primary-600">{totalPrice.toLocaleString()} FRW</span>
                </div>
              </div>

              {paymentMethod === 'momo' && (
                <div className="mt-4 bg-accent-50 border border-accent-200 rounded-xl p-3 text-sm">
                  <p className="font-semibold text-accent-800 mb-1">📱 MoMo Payment</p>
                  <p className="font-mono text-accent-900 font-bold">*182*8*1*675566#</p>
                  <p className="text-xs text-accent-600 mt-1">Use your Order ID as reference after placing</p>
                </div>
              )}

              <div className="mt-4 text-xs text-gray-400 space-y-1">
                <p>📦 Delivery fee is not included</p>
                <p>⏱ Order confirmed within 24h after payment</p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
};

export default CheckoutPage;
