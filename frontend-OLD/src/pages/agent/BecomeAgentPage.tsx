import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  UserPlus, LogIn, Wallet, Users, MapPin, ShieldCheck, TrendingUp,
  ClipboardCheck, Banknote, ArrowRight,
} from 'lucide-react';

const steps = [
  { title: 'Apply', desc: 'Fill out the agent form with your details and location. Takes about two minutes.' },
  { title: 'Get approved', desc: 'Kosmotive reviews your application and activates your account.' },
  { title: 'Sell', desc: 'Register customers, sell KosmoPads products for cash, MoMo, or PayGo installments.' },
  { title: 'Get paid', desc: 'Earn a commission on every completed sale — tracked automatically on your dashboard.' },
];

const benefits = [
  { icon: Wallet, title: 'Transparent commission', desc: 'A fixed percentage of every sale you make, visible on your dashboard the moment it\u2019s earned.' },
  { icon: Users, title: 'Your own customer base', desc: 'Register customers under your account and track their orders and PayGo balances.' },
  { icon: TrendingUp, title: 'PayGo sales, made simple', desc: 'Sell eligible products on installment plans without setting a single number yourself — Kosmotive\u2019s system calculates the terms.' },
  { icon: MapPin, title: 'Sell where you are', desc: 'Built for agents working directly in their district, sector, and community.' },
];

const requirements = [
  'Valid Rwandan National ID',
  'A working phone number for MoMo and customer contact',
  'Basic literacy to record customer and order details',
  'Willingness to follow Kosmotive\u2019s PayGo eligibility and pricing rules',
];

const BecomeAgentPage: React.FC = () => {
  return (
    <div className="bg-white">
      {/* Hero */}
      <section className="bg-gradient-to-b from-primary-50 to-white py-16 sm:py-24">
        <div className="container mx-auto px-4 max-w-4xl text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <span className="inline-flex items-center gap-2 bg-primary-100 text-primary-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-6">
              <Banknote size={14} /> Kosmotive Agent Program
            </span>
            <h1 className="text-4xl sm:text-5xl font-display font-bold text-gray-900 leading-tight mb-5">
              Sell KosmoPads in your community.<br className="hidden sm:block" /> Earn on every order.
            </h1>
            <p className="text-lg text-gray-500 max-w-2xl mx-auto mb-8">
              Kosmotive agents register customers, sell products for cash, MoMo, or PayGo installments,
              and earn a commission on every completed sale — tracked automatically, paid out transparently.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Link to="/agent/register" className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white font-semibold px-6 py-3.5 rounded-xl shadow-lg shadow-primary-200 transition-colors">
                <UserPlus size={18} /> Create Agent Account
              </Link>
              <Link to="/agent/login" className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-primary-300 text-gray-700 font-semibold px-6 py-3.5 rounded-xl transition-colors">
                <LogIn size={18} /> Agent Login
              </Link>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How it works */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 text-center mb-2">How it works</h2>
          <p className="text-gray-500 text-center mb-12">From application to your first commission payout.</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {steps.map((step, i) => (
              <div key={step.title} className="bg-gray-50 rounded-2xl p-6">
                <div className="w-9 h-9 rounded-full bg-primary-600 text-white flex items-center justify-center font-display font-bold text-sm mb-4">
                  {i + 1}
                </div>
                <h3 className="font-display font-semibold text-gray-900 mb-1.5">{step.title}</h3>
                <p className="text-sm text-gray-500">{step.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Benefits */}
      <section className="py-16 bg-gray-50">
        <div className="container mx-auto px-4 max-w-5xl">
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-gray-900 text-center mb-12">Why agents work with Kosmotive</h2>
          <div className="grid sm:grid-cols-2 gap-6">
            {benefits.map((b) => (
              <div key={b.title} className="bg-white rounded-2xl shadow-card p-6 flex gap-4">
                <div className="w-11 h-11 rounded-xl bg-primary-100 text-primary-600 flex items-center justify-center shrink-0">
                  <b.icon size={20} />
                </div>
                <div>
                  <h3 className="font-display font-semibold text-gray-900 mb-1">{b.title}</h3>
                  <p className="text-sm text-gray-500">{b.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Requirements + attribution/payouts */}
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-5xl grid md:grid-cols-2 gap-10">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <ClipboardCheck className="text-primary-600" size={22} />
              <h2 className="text-xl font-display font-bold text-gray-900">Who can become an agent</h2>
            </div>
            <ul className="space-y-3">
              {requirements.map((r) => (
                <li key={r} className="flex items-start gap-2.5 text-sm text-gray-600">
                  <ShieldCheck size={16} className="text-primary-500 mt-0.5 shrink-0" />
                  {r}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="flex items-center gap-2 mb-4">
              <Wallet className="text-primary-600" size={22} />
              <h2 className="text-xl font-display font-bold text-gray-900">Attribution & payouts</h2>
            </div>
            <div className="space-y-4 text-sm text-gray-600">
              <p>
                Every approved agent gets a unique referral link (e.g. <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">kosmopads.rw/?ref=KOS001</code>).
                If a customer starts shopping through your link, the resulting order is attributed to you —
                even after they browse products, build a cart, and check out later.
              </p>
              <p>
                Commission on a completed sale shows up as <span className="font-medium text-gray-800">pending</span> on
                your dashboard right away, and moves to <span className="font-medium text-gray-800">paid</span> once
                Kosmotive processes your payout. You can see the full history at any time.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Bottom CTA */}
      <section className="py-16 bg-primary-600">
        <div className="container mx-auto px-4 max-w-2xl text-center">
          <h2 className="text-2xl sm:text-3xl font-display font-bold text-white mb-3">Ready to start selling?</h2>
          <p className="text-primary-100 mb-8">Applications are usually reviewed within a few business days.</p>
          <Link to="/agent/register" className="inline-flex items-center gap-2 bg-white text-primary-700 font-semibold px-6 py-3.5 rounded-xl shadow-lg hover:bg-primary-50 transition-colors">
            Create Agent Account <ArrowRight size={18} />
          </Link>
        </div>
      </section>
    </div>
  );
};

export default BecomeAgentPage;
