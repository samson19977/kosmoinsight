import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CreditCard, Package, Wallet, CalendarCheck, ShieldCheck, TrendingUp, ArrowRight } from 'lucide-react';
import BackButton from '../components/common/BackButton';

const steps = [
  { icon: Package, title: 'Pick an eligible product', desc: 'Not every product is PayGo-eligible — eligible ones are marked at checkout.' },
  { icon: Wallet, title: 'Pay a small deposit', desc: "You choose your deposit amount (with a minimum) — the rest is what's financed." },
  { icon: CalendarCheck, title: 'Pay in installments', desc: "The remaining balance splits into equal monthly payments over your chosen term." },
  { icon: TrendingUp, title: 'Pay well, unlock better terms', desc: 'Customers with a good repayment history can get better rates on future PayGo loans.' },
];

// ============================================
// WHY THIS EXISTS: "Ask About PayGo" used to be a mailto link — it
// jumped straight to email with zero actual explanation of how PayGo
// works. Most people asking "what is PayGo" just want the answer, not
// to write an email and wait for a reply.
// ============================================
const PayGoInfoPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-2xl mx-auto">
        <BackButton />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <CreditCard className="text-teal-600" size={26} />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900">How PayGo Works</h1>
          <p className="text-gray-500 mt-1 text-sm max-w-md mx-auto">
            Can't pay for everything at once? PayGo lets you pay a small deposit today and spread the rest over easy monthly installments.
          </p>
        </motion.div>

        <div className="grid sm:grid-cols-2 gap-4 mb-6">
          {steps.map((s, i) => (
            <motion.div key={s.title} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 * i }} className="bg-white rounded-2xl shadow-card p-5">
              <div className="w-10 h-10 bg-teal-50 rounded-xl flex items-center justify-center mb-3">
                <s.icon className="text-teal-600" size={18} />
              </div>
              <p className="font-semibold text-gray-900 text-sm mb-1">{i + 1}. {s.title}</p>
              <p className="text-xs text-gray-500">{s.desc}</p>
            </motion.div>
          ))}
        </div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }} className="bg-teal-50 border border-teal-200 rounded-2xl p-6 mb-6">
          <div className="flex items-start gap-3">
            <ShieldCheck className="text-teal-600 flex-shrink-0 mt-0.5" size={20} />
            <div>
              <p className="font-semibold text-teal-800 text-sm mb-1">No hidden fees</p>
              <p className="text-xs text-teal-700">Your deposit, interest rate, term, and every installment amount are shown clearly before you confirm — nothing added later.</p>
            </div>
          </div>
        </motion.div>

        <div className="bg-white rounded-2xl shadow-card p-6 mb-6">
          <p className="font-semibold text-gray-900 text-sm mb-3">A few things worth knowing:</p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li>• Only one active PayGo plan per customer at a time — finish paying your current one before starting a new one.</li>
            <li>• You can pay more than an installment amount at any time to catch up or pay off your plan early.</li>
            <li>• Missing a payment may add a late penalty and affect your eligibility for better terms next time.</li>
            <li>• You can check your balance and pay your next installment yourself, any time — no need to visit an agent.</li>
          </ul>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <Link to="/my-loan" className="flex-1 inline-flex items-center justify-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-semibold py-3.5 rounded-xl transition-colors">
            Check My PayGo Status <ArrowRight size={16} />
          </Link>
          <Link to="/contact" className="flex-1 inline-flex items-center justify-center gap-2 border border-gray-200 hover:bg-gray-50 text-gray-700 font-semibold py-3.5 rounded-xl transition-colors">
            Still have questions? Contact us
          </Link>
        </div>
      </div>
    </div>
  );
};

export default PayGoInfoPage;
