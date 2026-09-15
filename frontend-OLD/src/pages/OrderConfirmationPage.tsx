import React, { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle, Copy, Phone, MapPin, Clock, Printer, ArrowRight, Home, RefreshCw, Wallet } from 'lucide-react';
import toast from 'react-hot-toast';
import { getOrderStatus } from '../services/orders.service';

// Poll every 6s for up to 10 minutes — enough for a real MoMo confirmation
// without hammering the API or polling forever if the customer walks away.
const POLL_INTERVAL_MS = 6000;
const POLL_TIMEOUT_MS = 10 * 60 * 1000;

const OrderConfirmationPage: React.FC = () => {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const location = useLocation();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(location.state ?? null);
  const [paymentStatus, setPaymentStatus] = useState<string>('pending');
  const [justPaid, setJustPaid] = useState(false);
  const pollStartedAt = useRef<number>(Date.now());

  useEffect(() => {
    if (!data && orderNumber) {
      fetch(`${import.meta.env.VITE_API_URL || 'http://localhost:3000/api'}/orders/${orderNumber}/status`)
        .then((r) => r.json())
        .then((d) => setData({ orderNumber: d.orderNumber, total: d.total, paymentMethod: d.paymentMethod }))
        .catch(() => {});
    }
  }, [orderNumber, data]);

  // paymentMethod arrives either as the raw checkout value ('cash' | 'momo')
  // or, if this page was loaded fresh via URL, as the descriptive string
  // stored on the order ('Cash on Delivery', 'Mobile Money (MTN / Airtel)').
  const isCash = /^cash/i.test(String(data?.paymentMethod ?? ''));

  // Live payment-status polling — auto-flips to "Paid" as soon as the
  // MoMo webhook confirms it, no manual refresh or status-page visit needed.
  useEffect(() => {
    const num = orderNumber || data?.orderNumber;
    if (!num) return;

    let cancelled = false;
    const poll = async () => {
      if (cancelled) return;
      if (Date.now() - pollStartedAt.current > POLL_TIMEOUT_MS) return; // give up quietly
      try {
        const result = await getOrderStatus(num);
        if (cancelled) return;
        if (result.paymentStatus && result.paymentStatus !== paymentStatus) {
          setPaymentStatus(result.paymentStatus);
          if (result.paymentStatus === 'paid') {
            setJustPaid(true);
            toast.success('Payment received! 🎉');
            return; // stop polling once paid
          }
        }
        if (result.paymentStatus !== 'paid') {
          setTimeout(poll, POLL_INTERVAL_MS);
        }
      } catch {
        setTimeout(poll, POLL_INTERVAL_MS); // transient network error — keep trying
      }
    };
    const t = setTimeout(poll, POLL_INTERVAL_MS);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderNumber, data?.orderNumber]);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied!`));
  };

  if (!data) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center">
        <div className="w-16 h-16 border-4 border-primary-500 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
        <p className="text-gray-500">Loading order details...</p>
      </div>
    </div>
  );

  const ussdCode = data.paymentInstructions?.ussdCode ?? '*182*8*1*675566#';

  return (
    <div className="min-h-screen bg-gray-50 py-10">
      <div className="container mx-auto px-4 max-w-2xl">
        {/* Success Card */}
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="bg-white rounded-3xl shadow-card overflow-hidden">
          {/* Green header */}
          <div className="bg-gradient-to-br from-emerald-500 to-primary-600 p-8 text-white text-center">
            <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.2, stiffness: 200 }}>
              <div className="w-20 h-20 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <CheckCircle size={48} className="text-white" />
              </div>
            </motion.div>
            <h1 className="text-2xl font-display font-bold mb-1">Order Placed!</h1>
            <p className="text-emerald-100 text-sm">Thank you{data.customerName ? `, ${data.customerName}` : ''}. Your order is confirmed.</p>
          </div>

          <div className="p-6 space-y-5">
            {/* Order Info Grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Order Number', value: data.orderNumber, mono: true },
                { label: 'Total Amount', value: `${data.total?.toLocaleString()} FRW`, bold: true },
                {
                  label: 'Status',
                  value: paymentStatus === 'paid' ? '✅ Payment Received' : '⏳ Awaiting Payment',
                  live: true,
                },
                { label: 'Delivery', value: '📦 Arranged separately' },
              ].map(({ label, value, mono, bold, live }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-3.5">
                  <p className="text-xs text-gray-400 mb-0.5 flex items-center gap-1">
                    {label}
                    {live && paymentStatus !== 'paid' && (
                      <RefreshCw size={10} className="animate-spin text-gray-300" />
                    )}
                  </p>
                  <p className={`text-sm ${mono ? 'font-mono' : ''} ${bold ? 'text-primary-600 font-bold text-base' : 'font-semibold text-gray-900'} ${live && paymentStatus === 'paid' ? 'text-emerald-600' : ''}`}>{value}</p>
                </div>
              ))}
            </div>

            <AnimatePresence>
              {justPaid && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                  className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex items-center gap-3"
                >
                  <CheckCircle size={22} className="text-emerald-600 flex-shrink-0" />
                  <p className="text-sm text-emerald-800"><strong>Payment confirmed!</strong> We're preparing your order and will contact you to arrange delivery.</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Payment Instructions — hidden once payment clears */}
            {paymentStatus !== 'paid' && !isCash && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="font-bold text-amber-800 mb-4 flex items-center gap-2">
                <Phone size={18} /> MTN MoMo Payment Instructions
              </h3>
              <div className="space-y-2">
                {[
                  { label: 'Dial this USSD code', value: ussdCode },
                  { label: 'Payment Reference', value: data.orderNumber },
                  { label: 'Amount to Pay', value: `${data.total?.toLocaleString()} FRW` },
                ].map(({ label, value }) => (
                  <div key={label} className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-amber-100">
                    <div>
                      <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                      <p className="font-mono font-bold text-gray-900">{value}</p>
                    </div>
                    <button onClick={() => copy(value, label)} className="p-2 hover:bg-amber-50 rounded-lg transition-colors text-gray-400 hover:text-amber-600">
                      <Copy size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <p className="text-xs text-amber-700 mt-3 leading-relaxed">
                <strong>Steps:</strong> Dial the USSD code → select Pay Bill → enter merchant code <strong>675566</strong> → enter amount → use Order Number as reference → confirm with PIN.
              </p>
            </div>
            )}

            {/* Cash on Delivery / Pickup — shown instead of MoMo instructions */}
            {paymentStatus !== 'paid' && isCash && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
              <h3 className="font-bold text-amber-800 mb-3 flex items-center gap-2">
                <Wallet size={18} /> Cash Payment
              </h3>
              <div className="bg-white rounded-xl px-4 py-3 border border-amber-100 mb-3">
                <p className="text-xs text-gray-400 mb-0.5">Amount to Pay</p>
                <p className="font-mono font-bold text-gray-900">{data.total?.toLocaleString()} FRW</p>
              </div>
              <p className="text-xs text-amber-700 leading-relaxed">
                You've chosen to pay in cash. Have the exact amount ready for our delivery agent, or at pickup. Your order will show as <strong>confirmed</strong> as soon as we've received payment — no action needed from you right now.
              </p>
            </div>
            )}

            {/* Delivery note */}
            <div className="flex items-start gap-3 bg-blue-50 rounded-xl p-4 text-sm">
              <MapPin size={18} className="text-blue-400 flex-shrink-0 mt-0.5" />
              <p className="text-blue-800"><strong>Delivery note:</strong> Delivery fee is not included and is paid directly by the client. We will contact you to arrange delivery after confirming your payment.</p>
            </div>

            {/* Timer note */}
            <div className="flex items-center gap-2 text-sm text-gray-500 bg-gray-50 rounded-xl p-3">
              <Clock size={16} className="text-gray-400" />
              <span>Please complete payment within <strong>48 hours</strong> to keep your order active.</span>
            </div>

            {/* Contact */}
            <div className="text-center text-sm text-gray-500 py-2">
              Need help?{' '}
              <Link to="/contact" className="text-primary-600 hover:underline font-medium">Contact us</Link>
            </div>

            {/* Actions */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button onClick={() => window.print()} className="flex items-center justify-center gap-2 border border-gray-200 py-3 rounded-xl text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-colors">
                <Printer size={16} /> Print
              </button>
              <button onClick={() => navigate('/products')} className="flex items-center justify-center gap-2 bg-primary-600 hover:bg-primary-700 text-white py-3 rounded-xl text-sm font-semibold transition-colors shadow-md shadow-primary-200">
                Shop More <ArrowRight size={16} />
              </button>
            </div>
            <button onClick={() => navigate(`/order-status/${data.orderNumber}`)} className="w-full text-center text-sm text-primary-600 hover:text-primary-700 font-medium py-1">
              Check Order Status →
            </button>
          </div>
        </motion.div>
      </div>
    </div>
  );
};

export default OrderConfirmationPage;
