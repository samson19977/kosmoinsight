import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowRight, Star, Shield, Users, Package, CreditCard, Phone, MapPin, CheckCircle, Leaf, ChevronDown } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { useCart } from '../context/CartContext';
import ProductImage from '../components/ui/ProductImage';
import toast from 'react-hot-toast';

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 24 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true },
  transition: { duration: 0.55, delay },
});

const FaqItem: React.FC<{ q: string; a: string; delay?: number }> = ({ q, a, delay = 0 }) => {
  const [open, setOpen] = useState(false);
  return (
    <motion.div {...fadeUp(delay)} className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between gap-4 text-left px-5 py-4"
      >
        <span className="font-semibold text-gray-900 text-sm">{q}</span>
        <ChevronDown size={18} className={`text-primary-500 flex-shrink-0 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <p className="px-5 pb-4 text-sm text-gray-500 leading-relaxed">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};

const HomePage: React.FC = () => {
  const { products } = useProducts();
  const { addToCart, openCart } = useCart();

  const handleAdd = (p: any) => {
    addToCart(p);
    toast.success(`${p.name} added to cart!`);
    openCart();
  };

  return (
    <div className="min-h-screen">
      {/* ── HERO ─────────────────────────────────────── */}
      <section className="relative bg-gradient-to-br from-primary-700 via-primary-600 to-emerald-500 text-white overflow-hidden min-h-[88vh] flex items-center">
        {/* decorative blobs */}
        <div className="absolute top-0 right-0 w-[600px] h-[600px] bg-white/5 rounded-full -translate-y-1/2 translate-x-1/3 blur-3xl" />
        <div className="absolute bottom-0 left-0 w-96 h-96 bg-secondary-400/10 rounded-full translate-y-1/2 -translate-x-1/3 blur-3xl" />

        <div className="container mx-auto px-4 py-24 relative z-10">
          <div className="max-w-2xl">
            <motion.span
              initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm text-white px-4 py-1.5 rounded-full text-sm font-semibold mb-6 border border-white/30"
            >
              <span className="text-base">🇷🇼</span> Built for Rwanda
            </motion.span>

            <motion.h1
              initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.65, delay: 0.1 }}
              className="font-display text-5xl md:text-7xl font-extrabold leading-[1.05] mb-6 tracking-tight"
            >
              Menstrual Health,<br />
              <span className="text-accent-300">Made Sustainable</span>
            </motion.h1>

            <motion.p
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
              className="text-lg md:text-xl text-primary-100 mb-8 leading-relaxed max-w-xl"
            >
              Quality, eco-friendly menstrual pads delivered to your doorstep.
              Pay with MTN MoMo or cash — simple, safe, and dignified.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="flex flex-wrap gap-3 mb-10"
            >
              <Link to="/products" className="inline-flex items-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-900 px-7 py-3.5 rounded-xl font-bold transition-all hover:scale-105 shadow-xl shadow-accent-900/30 text-base">
                Shop Now <ArrowRight size={18} />
              </Link>
              <Link to="/order-status" className="inline-flex items-center gap-2 bg-white/20 hover:bg-white/30 backdrop-blur-sm text-white px-7 py-3.5 rounded-xl font-semibold transition-all border border-white/30 text-base">
                Track Order
              </Link>
            </motion.div>

            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55 }}
              className="flex flex-wrap gap-5 text-sm text-primary-200"
            >
              <span className="flex items-center gap-1.5"><Phone size={15} /> MTN MoMo: *182*8*1*675566#</span>
              <span className="flex items-center gap-1.5"><MapPin size={15} /> Delivery across Rwanda</span>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── QUICK TRUST STRIP ─────────────────────────────────────── */}
      <section className="py-10 bg-white border-b border-gray-100">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { icon: Package, label: 'Eco-friendly, reusable pads' },
              { icon: Shield, label: 'Clinically tested & safe' },
              { icon: CreditCard, label: 'MoMo, cash, or PayGo installments' },
              { icon: MapPin, label: 'Delivery across Rwanda' },
            ].map(({ icon: Icon, label }, i) => (
              <motion.div key={i} {...fadeUp(i * 0.06)} className="flex items-center gap-2.5 text-sm text-gray-600 font-medium">
                <span className="w-9 h-9 rounded-lg bg-primary-50 flex items-center justify-center flex-shrink-0">
                  <Icon size={17} className="text-primary-600" />
                </span>
                {label}
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SHOP NOW — the main event ─────────────────────────────── */}
      <section className="py-20 bg-white" id="shop">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-4">
            <div>
              <span className="text-primary-600 font-semibold text-sm tracking-widest uppercase">Shop Now</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mt-1">Pick your pads</h2>
              <p className="text-gray-500 mt-2 max-w-xl">Add as many products as you like to your cart — mix packages, adjust quantities, and check out once.</p>
            </div>
            <Link to="/products" className="hidden md:flex items-center gap-1 text-primary-600 hover:text-primary-700 font-semibold text-sm">
              View All <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {(products ?? [
              { id: 1, name: 'Large Package', priceRwf: 2000, packageType: 'large', description: '1 Large KosmoPad suitable for heavy flow' },
              { id: 2, name: 'Medium Package', priceRwf: 6000, packageType: 'medium', description: '5 Medium KosmoPads dignity kit', installmentEligible: true },
              { id: 5, name: 'Small Package', priceRwf: 5000, packageType: 'small', description: '5 Small KosmoPads dignity kit' },
              { id: 4, name: 'Mix of 2', priceRwf: 2500, packageType: 'mix', description: '1 Small + 1 Medium experience pack' },
            ]).slice(0, 8).map((product, i) => (
              <motion.div key={product.id} {...fadeUp(i * 0.07)}
                className="group bg-white rounded-2xl shadow-card hover:shadow-card-hover border border-gray-100 overflow-hidden transition-all duration-300"
              >
                <Link to={`/products/${product.id}`} className="h-44 relative block">
                  <ProductImage
                    packageType={product.packageType}
                    imageUrl={product.imageUrl}
                    name={product.name}
                    className="w-full h-full"
                    emojiClassName="text-6xl group-hover:scale-110 transition-transform duration-300 drop-shadow"
                  />
                  {product.installmentEligible && (
                    <span className="absolute top-2 left-2 bg-accent-400 text-primary-900 text-[10px] font-bold px-2 py-1 rounded-full shadow-md">
                      PayGo available
                    </span>
                  )}
                </Link>
                <div className="p-4">
                  <Link to={`/products/${product.id}`}>
                    <h3 className="font-semibold text-gray-900 text-sm mb-0.5 line-clamp-1 group-hover:text-primary-600 transition-colors">{product.name}</h3>
                    <p className="text-xs text-gray-400 mb-3 line-clamp-2">{product.description}</p>
                  </Link>
                  <div className="flex items-center justify-between">
                    <span className="text-lg font-bold text-primary-600">{product.priceRwf.toLocaleString()} <span className="text-xs font-normal text-gray-400">FRW</span></span>
                    <button onClick={() => handleAdd(product)} className="bg-primary-600 hover:bg-primary-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold transition-all hover:scale-105 shadow-md shadow-primary-200">
                      Add +
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>

          <div className="text-center mt-8 md:hidden">
            <Link to="/products" className="inline-flex items-center gap-2 bg-primary-600 text-white px-6 py-3 rounded-xl font-semibold">
              View All Products <ArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* ── PAYGO ─────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-emerald-600 to-primary-700 text-white overflow-hidden relative">
        <div className="absolute top-0 right-0 w-96 h-96 bg-white/5 rounded-full -translate-y-1/3 translate-x-1/4 blur-3xl" />
        <div className="container mx-auto px-4 relative z-10">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeUp()}>
              <span className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-sm px-4 py-1.5 rounded-full text-sm font-semibold mb-5 border border-white/30">
                <CreditCard size={15} /> Flexible Payments
              </span>
              <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">Can't pay it all at once? Buy with PayGo.</h2>
              <p className="text-primary-100 text-lg leading-relaxed mb-6 max-w-lg">
                Pay a small deposit today and spread the rest over easy installments. PayGo is available on
                select KosmoPads products through our team and agents — no hidden fees, clear terms upfront.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/my-loan" className="inline-flex items-center gap-2 bg-accent-400 hover:bg-accent-300 text-primary-900 px-7 py-3.5 rounded-xl font-bold transition-all hover:scale-105 shadow-xl shadow-accent-900/30">
                  Check My PayGo Status <ArrowRight size={18} />
                </Link>
                <Link to="/paygo-info" className="inline-flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white px-7 py-3.5 rounded-xl font-semibold transition-all border border-white/30">
                  Ask About PayGo
                </Link>
              </div>
            </motion.div>
            <motion.div {...fadeUp(0.15)} className="grid grid-cols-2 gap-4">
              {[
                { icon: Package, title: 'Pick a Product', desc: 'Choose an eligible package' },
                { icon: CreditCard, title: 'Pay a Deposit', desc: 'A small down payment to start' },
                { icon: CheckCircle, title: 'Get It Today', desc: 'Take your order home right away' },
                { icon: Shield, title: 'Pay as You Go', desc: 'Clear schedule, easy installments' },
              ].map(({ icon: Icon, title, desc }, i) => (
                <div key={i} className="bg-white/10 backdrop-blur-sm border border-white/20 rounded-2xl p-5">
                  <Icon className="text-accent-300 mb-3" size={24} />
                  <h3 className="font-semibold mb-1">{title}</h3>
                  <p className="text-primary-100 text-xs leading-relaxed">{desc}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── BECOME AN AGENT ──────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <motion.div {...fadeUp()} className="order-2 md:order-1 grid grid-cols-2 gap-4">
              {[
                { icon: Users, label: 'Sell to your community' },
                { icon: CreditCard, label: 'Earn commission per sale' },
                { icon: Package, label: 'Use the full product catalogue' },
                { icon: CheckCircle, label: 'Track everything on your dashboard' },
              ].map(({ icon: Icon, label }, i) => (
                <div key={i} className="bg-primary-50 rounded-2xl p-5 text-center">
                  <Icon className="text-primary-600 mx-auto mb-2" size={24} />
                  <p className="text-sm font-medium text-gray-700">{label}</p>
                </div>
              ))}
            </motion.div>
            <motion.div {...fadeUp(0.1)} className="order-1 md:order-2">
              <span className="text-primary-600 font-semibold text-sm tracking-widest uppercase mb-3 block">Join the Team</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mb-4">Become a KosmoPads Agent</h2>
              <p className="text-gray-500 text-lg leading-relaxed mb-6">
                Sell KosmoPads in your community, register customers, and earn commission on every sale —
                including PayGo orders. Get your own referral link and dashboard once approved.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link to="/become-an-agent" className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-7 py-3.5 rounded-xl font-bold transition-all hover:scale-105 shadow-xl shadow-primary-200">
                  Become an Agent <ArrowRight size={18} />
                </Link>
                <Link to="/agent/login" className="inline-flex items-center gap-2 bg-primary-50 hover:bg-primary-100 text-primary-700 px-7 py-3.5 rounded-xl font-semibold transition-all border border-primary-100">
                  Agent Login
                </Link>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────── */}
      <section className="py-20 bg-primary-50">
        <div className="container mx-auto px-4">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <span className="text-primary-600 font-semibold text-sm tracking-widest uppercase mb-3 block">Simple Process</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900">How It Works</h2>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-8 max-w-3xl mx-auto">
            {[
              { step: '1', icon: Package, title: 'Pick Your Pads', desc: 'Browse our range of eco-friendly menstrual pads and select what you need.' },
              { step: '2', icon: CreditCard, title: 'Place Your Order', desc: 'Fill in your details and choose MTN MoMo or cash as your payment method.' },
              { step: '3', icon: CheckCircle, title: 'Get Delivered', desc: 'We confirm your payment and arrange delivery. You pay the delivery fee directly.' },
            ].map(({ step, icon: Icon, title, desc }, i) => (
              <motion.div key={i} {...fadeUp(i * 0.12)} className="relative text-center">
                <div className="w-16 h-16 bg-gradient-to-br from-primary-500 to-primary-700 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-lg shadow-primary-200">
                  <Icon className="text-white" size={28} />
                </div>
                <span className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-2 bg-accent-400 text-primary-900 text-xs font-black w-6 h-6 rounded-full flex items-center justify-center">{step}</span>
                <h3 className="font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ─────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <span className="text-primary-600 font-semibold text-sm tracking-widest uppercase mb-3 block">Community</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900">Real Stories</h2>
            <p className="text-gray-500 mt-2 max-w-md mx-auto">What Rwandan women say about KosmoPads</p>
          </motion.div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { name: 'Kayitesi A.', role: 'Kigali, Rwanda', quote: 'KosmoPads changed everything for me. I barely notice I\'m wearing pads anymore — soft, safe, and the most comfortable I\'ve ever used.' },
              { name: 'Chantal N.', role: 'Musanze, Rwanda', quote: 'I bought several for my children too. Reusable pads help reduce our monthly spending, and they\'re very comfortable to wear.' },
              { name: 'Jessica U.', role: 'Huye, Rwanda', quote: 'I recommend KosmoPads to all my friends — they reduce plastic waste and help our environment while taking care of ourselves.' },
            ].map(({ name, role, quote }, i) => (
              <motion.div key={i} {...fadeUp(i * 0.1)} className="bg-gray-50 p-6 rounded-2xl border border-gray-100 hover:shadow-card transition-all">
                <div className="flex gap-0.5 text-accent-400 mb-4">
                  {Array.from({ length: 5 }).map((_, j) => <Star key={j} size={15} fill="currentColor" />)}
                </div>
                <p className="text-gray-700 text-sm leading-relaxed mb-5">"{quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-gradient-to-br from-primary-400 to-secondary-500 rounded-full flex items-center justify-center text-white font-bold text-sm">{name[0]}</div>
                  <div>
                    <p className="font-semibold text-gray-900 text-sm">{name}</p>
                    <p className="text-xs text-gray-400">{role}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ─────────────────────────────────────── */}
      <section className="py-20 bg-primary-50">
        <div className="container mx-auto px-4 max-w-3xl">
          <motion.div {...fadeUp()} className="text-center mb-12">
            <span className="text-primary-600 font-semibold text-sm tracking-widest uppercase mb-3 block">Got Questions?</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900">Frequently Asked Questions</h2>
          </motion.div>
          <div className="space-y-3">
            {[
              { q: 'How do I pay for my order?', a: 'You can pay via MTN Mobile Money using our USSD code (*182*8*1*675566#) or choose cash on delivery. Your order is confirmed once payment is received.' },
              { q: 'Is delivery available across all of Rwanda?', a: 'Yes, we deliver to all 30 districts of Rwanda. The delivery fee is arranged and paid separately once we contact you after your order is placed.' },
              { q: 'How long does delivery take?', a: 'Most orders are confirmed and dispatched within 24 hours of payment confirmation. Delivery timing depends on your location and is coordinated directly with you.' },
              { q: 'Can I track my order?', a: 'Yes — use the "Track Order" page with your order number to see real-time status, from pending payment through to delivery.' },
              { q: 'Are KosmoPads reusable and eco-friendly?', a: 'Yes, our pads are designed to be sustainable and reusable, helping reduce both cost and environmental impact compared to disposables.' },
            ].map((item, i) => <FaqItem key={i} {...item} delay={i * 0.06} />)}
          </div>
        </div>
      </section>

      {/* ── CTA ─────────────────────────────────────── */}
      <section className="py-20 bg-gradient-to-br from-primary-700 to-primary-900 text-white">
        <div className="container mx-auto px-4 text-center">
          <motion.div {...fadeUp()}>
            <Leaf size={40} className="mx-auto mb-4 text-primary-300" />
            <h2 className="text-3xl md:text-5xl font-display font-bold mb-4">Ready to Make the Switch?</h2>
            <p className="text-primary-200 mb-8 max-w-xl mx-auto text-lg">
              Join thousands of Rwandan women who trust KosmoPads for their menstrual health and dignity.
            </p>
            <div className="flex flex-wrap justify-center gap-4">
              <Link to="/products" className="bg-accent-400 hover:bg-accent-300 text-primary-900 px-8 py-4 rounded-xl font-bold transition-all hover:scale-105 shadow-xl shadow-accent-900/30">
                Shop Now
              </Link>
              <Link to="/contact" className="bg-white/15 hover:bg-white/25 text-white px-8 py-4 rounded-xl font-semibold transition-all border border-white/30">
                Contact Us
              </Link>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
