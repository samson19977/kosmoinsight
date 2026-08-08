import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Search, CheckCircle, Clock, XCircle, Package, Loader2, ArrowRight } from 'lucide-react';
import { getOrderStatus } from '../services/orders.service';
import toast from 'react-hot-toast';

const statusConfig: Record<string, { label: string; icon: React.FC<any>; color: string; bg: string; desc: string }> = {
  pending:    { label: 'Pending',    icon: Clock,        color: 'text-amber-600', bg: 'bg-amber-50 border-amber-200', desc: 'Your order is waiting for payment confirmation.' },
  confirmed:  { label: 'Confirmed',  icon: CheckCircle,  color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', desc: 'Payment confirmed! We are preparing your order.' },
  processing: { label: 'Processing', icon: Package,      color: 'text-blue-600', bg: 'bg-blue-50 border-blue-200', desc: 'Your order is being packed and prepared for delivery.' },
  delivered:  { label: 'Delivered',  icon: CheckCircle,  color: 'text-primary-600', bg: 'bg-primary-50 border-primary-200', desc: 'Order delivered successfully. Thank you!' },
  cancelled:  { label: 'Cancelled',  icon: XCircle,      color: 'text-red-600', bg: 'bg-red-50 border-red-200', desc: 'This order has been cancelled.' },
};

const OrderStatusPage: React.FC = () => {
  const { orderNumber: paramOrder } = useParams<{ orderNumber?: string }>();
  const navigate = useNavigate();
  const [orderNum, setOrderNum] = useState(paramOrder ?? '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [notFound, setNotFound] = useState(false);

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!orderNum.trim()) { toast.error('Please enter an order number'); return; }
    setLoading(true); setNotFound(false); setResult(null);
    try {
      const data = await getOrderStatus(orderNum.trim());
      setResult(data);
    } catch {
      setNotFound(true);
      toast.error('Order not found. Check your order number.');
    } finally { setLoading(false); }
  };

  // Auto-lookup if coming from URL param
  React.useEffect(() => { if (paramOrder) lookup(); }, []);

  const status = result ? (statusConfig[result.orderStatus] ?? statusConfig['pending']) : null;
  const isCash = /^cash/i.test(String(result?.paymentMethod ?? ''));

  return (
    <div className="min-h-screen bg-gray-50 py-12">
      <div className="container mx-auto px-4 max-w-xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
          {/* Header */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <Package size={32} className="text-primary-600" />
            </div>
            <h1 className="text-3xl font-display font-bold text-gray-900">Track Your Order</h1>
            <p className="text-gray-500 mt-2 text-sm">Enter your order number to check its status</p>
          </div>

          {/* Search Form */}
          <form onSubmit={lookup} className="bg-white rounded-2xl shadow-card p-6 mb-6">
            <label className="block text-sm font-semibold text-gray-700 mb-2">Order Number</label>
            <div className="flex gap-3">
              <input
                type="text"
                value={orderNum}
                onChange={(e) => setOrderNum(e.target.value)}
                placeholder="e.g. KOS-20260124-5432"
                className="flex-1 px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 font-mono"
              />
              <button type="submit" disabled={loading}
                className="bg-primary-600 hover:bg-primary-700 text-white px-5 py-3 rounded-xl font-semibold transition-all hover:scale-105 shadow-md shadow-primary-200 flex items-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />}
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">Your order number was sent to your email and shown on the confirmation page.</p>
          </form>

          {/* Not Found */}
          {notFound && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
              <XCircle size={40} className="text-red-400 mx-auto mb-3" />
              <p className="font-semibold text-red-800 mb-1">Order Not Found</p>
              <p className="text-sm text-red-600">Double-check the order number or contact us at <a href="mailto:digital@kosmotive.rw" className="underline">digital@kosmotive.rw</a></p>
            </motion.div>
          )}

          {/* Result */}
          {result && status && (
            <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-2xl shadow-card overflow-hidden">
              {/* Status banner */}
              <div className={`px-6 py-5 border-b ${status.bg} border flex items-center gap-4`}>
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center bg-white border ${status.bg}`}>
                  <status.icon size={24} className={status.color} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Current Status</p>
                  <p className={`text-lg font-bold ${status.color}`}>{status.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{status.desc}</p>
                </div>
              </div>

              {/* Details */}
              <div className="p-6 space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { label: 'Order Number', value: result.orderNumber },
                    { label: 'Payment', value: result.paymentStatus === 'paid' ? '✅ Paid' : '⏳ Pending' },
                    { label: 'Total', value: result.total ? `${result.total.toLocaleString()} FRW` : '—' },
                    { label: 'Placed', value: result.createdAt ? new Date(result.createdAt).toLocaleDateString() : '—' },
                  ].map(({ label, value }) => (
                    <div key={label} className="bg-gray-50 rounded-xl p-3">
                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                      <p className="text-sm font-semibold text-gray-900">{value}</p>
                    </div>
                  ))}
                </div>

                {result.paymentStatus !== 'paid' && !isCash && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                    <p className="font-semibold text-amber-800 mb-1">⏳ Payment still pending</p>
                    <p className="text-amber-700 text-xs">Dial <strong className="font-mono">*182*8*1*675566#</strong> and use your order number <strong>{result.orderNumber}</strong> as reference.</p>
                  </div>
                )}

                {result.paymentStatus !== 'paid' && isCash && (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
                    <p className="font-semibold text-amber-800 mb-1">⏳ Awaiting cash payment</p>
                    <p className="text-amber-700 text-xs">You chose to pay in cash. This order will move to <strong>Confirmed</strong> once we've received your payment.</p>
                  </div>
                )}

                <div className="flex gap-3 pt-2">
                  <button onClick={() => navigate('/products')} className="flex-1 border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                    Keep Shopping
                  </button>
                  {result.paymentStatus !== 'paid' && (
                    <button onClick={() => navigate('/checkout')} className="flex-1 bg-primary-600 text-white py-3 rounded-xl text-sm font-semibold flex items-center justify-center gap-1 transition-colors hover:bg-primary-700 shadow-md shadow-primary-200">
                      Reorder <ArrowRight size={14} />
                    </button>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </motion.div>
      </div>
    </div>
  );
};

export default OrderStatusPage;
