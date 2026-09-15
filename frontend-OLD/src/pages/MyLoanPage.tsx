import React, { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import { Search, Loader2, CheckCircle2, Smartphone, Calendar, TrendingUp } from 'lucide-react';
import { fetchLoanStatus, payInstallmentMomo, type LoanStatus } from '../services/loans.service';
import BackButton from '../components/common/BackButton';

const statusPill: Record<string, string> = {
  paid: 'bg-emerald-50 text-emerald-600',
  partial: 'bg-amber-50 text-amber-600',
  overdue: 'bg-red-50 text-red-600',
  upcoming: 'bg-gray-100 text-gray-500',
};

const RWANDA_PHONE_REGEX = /^(\+250|0)[78][0-9]{8}$/;

// ============================================
// MyLoanPage — customer self-service for PayGo installment plans.
//
// WHY THIS EXISTS: the backend already has a complete, secure,
// phone-gated self-service API for this (GET /api/loans/:loanNumber/status,
// POST .../pay-momo) — built with rate limiting, amount capping, and race
// safety — but nothing in the storefront actually used it. Every PayGo
// payment had to go through an agent or admin manually recording it.
// A real customer in a modern fintech product should be able to check
// their own balance and pay their own installment without needing staff
// involved for every single payment — this page is that missing front end.
//
// Verification is phone-number-based (matches the loan's customer record)
// rather than a full login, matching the same low-friction pattern
// already used for order tracking elsewhere on the storefront.
// ============================================
const MyLoanPage: React.FC = () => {
  const [loanNumber, setLoanNumber] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<LoanStatus | null>(null);
  const [notFound, setNotFound] = useState(false);

  const [payAmount, setPayAmount] = useState('');
  const [paying, setPaying] = useState(false);
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollAttemptsRef = useRef(0);

  const lookup = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!loanNumber.trim()) { toast.error('Enter your loan number'); return; }
    if (!RWANDA_PHONE_REGEX.test(phone.trim())) { toast.error('Enter the phone number on file for this loan'); return; }
    setLoading(true); setNotFound(false); setResult(null);
    try {
      const data = await fetchLoanStatus(loanNumber.trim(), phone.trim());
      setResult(data);
      setPayAmount(data.nextInstallment ? String(data.nextInstallment.amountDueRwf + data.nextInstallment.penaltyRwf - data.nextInstallment.amountPaidRwf) : '');
    } catch {
      setNotFound(true);
      toast.error("Couldn't find that loan — check the loan number and phone number.");
    } finally {
      setLoading(false);
    }
  };

  const stopPolling = () => {
    if (pollRef.current) clearInterval(pollRef.current);
    pollRef.current = null;
    pollAttemptsRef.current = 0;
  };

  useEffect(() => () => stopPolling(), []);

  const handlePay = async () => {
    if (!result?.nextInstallment) return;
    const amount = Number(payAmount);
    if (!amount || amount < 100) { toast.error('Enter a valid amount (at least 100 RWF)'); return; }
    if (amount > result.remainingRwf) { toast.error(`Amount exceeds what's owed (${result.remainingRwf.toLocaleString()} RWF remaining)`); return; }

    setPaying(true);
    try {
      await payInstallmentMomo(result.loanNumber, result.nextInstallment.id, amount, phone.trim());
      toast.success('Check your phone to approve the payment!');
      setAwaitingApproval(true);

      // Poll for resolution — the actual payment only lands once MTN
      // confirms it (webhook or the backend's own reconciliation poll),
      // so we watch for the installment's pending flag to clear.
      pollAttemptsRef.current = 0;
      pollRef.current = setInterval(async () => {
        pollAttemptsRef.current += 1;
        try {
          const fresh = await fetchLoanStatus(result.loanNumber, phone.trim());
          setResult(fresh);
          const stillPending = fresh.schedule.find((i) => i.id === result.nextInstallment!.id)?.pendingPayment;
          if (!stillPending) {
            stopPolling();
            setAwaitingApproval(false);
            setPaying(false);
            setPayAmount(fresh.nextInstallment ? String(fresh.nextInstallment.amountDueRwf + fresh.nextInstallment.penaltyRwf - fresh.nextInstallment.amountPaidRwf) : '');
            toast.success('Payment confirmed — thank you! 🎉');
          }
        } catch {
          // transient — keep polling until the timeout below gives up
        }
        if (pollAttemptsRef.current >= 24) { // ~2 minutes at 5s intervals
          stopPolling();
          setAwaitingApproval(false);
          setPaying(false);
          toast('Still waiting on confirmation — refresh in a bit to check again.', { icon: '⏳' });
        }
      }, 5000);
    } catch (err: any) {
      toast.error(err.message || 'Failed to start payment');
      setPaying(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <BackButton />
        <div className="text-center mb-8">
          <h1 className="text-2xl font-display font-bold text-gray-900">My PayGo Loan</h1>
          <p className="text-gray-500 mt-1 text-sm">Check your balance and pay your next installment — no need to visit an agent.</p>
        </div>

        <motion.form
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onSubmit={lookup}
          className="bg-white rounded-2xl shadow-card p-6 mb-6"
        >
          <div className="grid sm:grid-cols-2 gap-3 mb-3">
            <input
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="Loan number (e.g. PGO-20260826-6660)"
              value={loanNumber}
              onChange={(e) => setLoanNumber(e.target.value)}
              autoComplete="off"
            />
            <input
              className="px-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
              placeholder="Your phone number (0788123456)"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              autoComplete="off"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-primary-600 hover:bg-primary-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
          >
            {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            {loading ? 'Checking…' : 'Check My Loan'}
          </button>
          {notFound && <p className="text-sm text-red-500 mt-3 text-center">Loan not found — double check your loan number and the phone number you registered with.</p>}
        </motion.form>

        {result && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
            {/* Summary */}
            <div className="bg-white rounded-2xl shadow-card p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-gray-900">{result.loanNumber}</h2>
                <span className={`px-3 py-1 rounded-full text-xs font-semibold ${result.status === 'completed' ? 'bg-emerald-50 text-emerald-600' : result.status === 'defaulted' ? 'bg-red-50 text-red-600' : 'bg-teal-50 text-teal-700'}`}>
                  {result.status === 'completed' ? '🎉 Fully paid off' : result.status}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-gray-50 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-0.5">Total payable</p>
                  <p className="font-bold text-gray-900 text-sm">{result.totalPayableRwf.toLocaleString()} FRW</p>
                </div>
                <div className="bg-emerald-50 rounded-xl p-3">
                  <p className="text-xs text-emerald-500 mb-0.5">Paid so far</p>
                  <p className="font-bold text-emerald-700 text-sm">{result.paidRwf.toLocaleString()} FRW</p>
                </div>
                <div className="bg-amber-50 rounded-xl p-3">
                  <p className="text-xs text-amber-600 mb-0.5">Remaining</p>
                  <p className="font-bold text-amber-700 text-sm">{result.remainingRwf.toLocaleString()} FRW</p>
                </div>
              </div>
              <div className="mt-4 bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="bg-primary-600 h-full rounded-full transition-all" style={{ width: `${result.repaymentRatePercent}%` }} />
              </div>
              <p className="text-xs text-gray-400 mt-1.5 flex items-center gap-1"><TrendingUp size={12} /> {result.repaymentRatePercent}% repaid</p>
            </div>

            {/* Pay next installment */}
            {result.status === 'active' && result.nextInstallment && (
              <div className="bg-teal-50 border border-teal-200 rounded-2xl p-6">
                <p className="font-semibold text-teal-800 flex items-center gap-2 mb-1">
                  <Calendar size={16} /> Next payment due {new Date(result.nextInstallment.dueDate).toLocaleDateString()}
                </p>
                <p className="text-xs text-teal-600 mb-4">Installment #{result.nextInstallment.installmentNumber}</p>

                {result.nextInstallment.pendingPayment || awaitingApproval ? (
                  <div className="bg-white rounded-xl p-4 text-center">
                    <Loader2 className="animate-spin mx-auto mb-2 text-teal-600" size={24} />
                    <p className="text-sm font-medium text-gray-700">Check your phone to approve the payment</p>
                    <p className="text-xs text-gray-400 mt-1">This updates automatically once confirmed.</p>
                  </div>
                ) : (
                  <>
                    <div className="flex gap-2 mb-3">
                      <div className="relative flex-1">
                        <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400 text-sm">RWF</span>
                        <input
                          type="number"
                          className="w-full pl-12 pr-4 py-3 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary-400"
                          value={payAmount}
                          onChange={(e) => setPayAmount(e.target.value)}
                          min={100}
                          max={result.remainingRwf}
                        />
                      </div>
                    </div>
                    <p className="text-xs text-teal-600 mb-3">You can pay more than this installment to catch up or pay off your loan faster — up to the full remaining balance.</p>
                    <button
                      onClick={handlePay}
                      disabled={paying}
                      className="w-full bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white font-semibold py-3 rounded-xl flex items-center justify-center gap-2 transition-colors"
                    >
                      {paying ? <Loader2 className="animate-spin" size={18} /> : <Smartphone size={18} />}
                      {paying ? 'Starting payment…' : 'Pay via Mobile Money'}
                    </button>
                  </>
                )}
              </div>
            )}

            {result.status === 'completed' && (
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-6 text-center">
                <CheckCircle2 className="mx-auto text-emerald-600 mb-2" size={32} />
                <p className="font-semibold text-emerald-800">This loan is fully paid off — congratulations!</p>
              </div>
            )}

            {/* Schedule */}
            <div className="bg-white rounded-2xl shadow-card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-wide">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">#</th>
                    <th className="text-left px-4 py-3 font-medium">Due</th>
                    <th className="text-left px-4 py-3 font-medium">Amount</th>
                    <th className="text-left px-4 py-3 font-medium">Paid</th>
                    <th className="text-left px-4 py-3 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {result.schedule.map((i) => (
                    <tr key={i.id}>
                      <td className="px-4 py-3 text-gray-500">{i.installmentNumber}</td>
                      <td className="px-4 py-3 text-gray-700">{new Date(i.dueDate).toLocaleDateString()}</td>
                      <td className="px-4 py-3 text-gray-700">{(i.amountDueRwf + i.penaltyRwf).toLocaleString()} FRW</td>
                      <td className="px-4 py-3 text-gray-700">{i.amountPaidRwf.toLocaleString()} FRW</td>
                      <td className="px-4 py-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusPill[i.status] || 'bg-gray-100 text-gray-500'}`}>{i.status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};

export default MyLoanPage;
