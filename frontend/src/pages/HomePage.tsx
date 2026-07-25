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

      {/* ── STATS ─────────────────────────────────────── */}
      <section className="py-12 bg-white border-b border-gray-100">
        <div className="container mx-auto px-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
            {[
              { number: '800K+', label: 'Lives Impacted' },
              { number: '100%', label: 'Customer Satisfaction' },
              { number: '88%', label: 'Cost Savings vs Disposables' },
              { number: '25+', label: 'Districts Served' },
            ].map((s, i) => (
              <motion.div key={i} {...fadeUp(i * 0.08)} className="text-center py-4">
                <div className="text-4xl font-display font-extrabold text-primary-600">{s.number}</div>
                <div className="text-sm text-gray-500 mt-1">{s.label}</div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY US ─────────────────────────────────────── */}
      <section className="py-20 bg-gray-50">
        <div className="container mx-auto px-4">
          <motion.div {...fadeUp()} className="text-center mb-14">
            <span className="inline-block text-primary-600 font-semibold text-sm tracking-widest uppercase mb-3">Why KosmoPads</span>
            <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900">
              More than just a pad
            </h2>
            <p className="text-gray-500 mt-3 max-w-xl mx-auto">We're on a mission to make menstrual health accessible and sustainable for every woman in Rwanda.</p>
          </motion.div>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: Package, title: 'Quality Products', desc: 'Sustainable, eco-friendly pads made with care for Rwandan women.', color: 'from-primary-500 to-primary-600' },
              { icon: Shield, title: 'Clinically Tested', desc: 'Approved for comfort, safety, and reliability — every single batch.', color: 'from-secondary-400 to-secondary-600' },
              { icon: Users, title: 'Women First', desc: 'Supporting health and dignity across every district of Rwanda.', color: 'from-accent-400 to-accent-600' },
              { icon: CreditCard, title: 'Easy Payments', desc: 'Pay via MTN MoMo or cash with our frictionless checkout.', color: 'from-primary-500 to-emerald-500' },
            ].map(({ icon: Icon, title, desc, color }, i) => (
              <motion.div key={i} {...fadeUp(i * 0.1)} className="bg-white p-6 rounded-2xl shadow-card hover:shadow-card-hover transition-all duration-300 group cursor-default">
                <div className={`w-14 h-14 bg-gradient-to-br ${color} rounded-2xl flex items-center justify-center mb-5 shadow-lg group-hover:scale-110 transition-transform duration-300`}>
                  <Icon className="text-white" size={26} />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
                <p className="text-gray-500 text-sm leading-relaxed">{desc}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRODUCTS PREVIEW ─────────────────────────────── */}
      <section className="py-20 bg-white">
        <div className="container mx-auto px-4">
          <div className="flex justify-between items-end mb-10">
            <div>
              <span className="text-primary-600 font-semibold text-sm tracking-widest uppercase">Our Range</span>
              <h2 className="text-3xl md:text-4xl font-display font-bold text-gray-900 mt-1">Best-Selling Pads</h2>
            </div>
            <Link to="/products" className="hidden md:flex items-center gap-1 text-primary-600 hover:text-primary-700 font-semibold text-sm">
              View All <ArrowRight size={16} />
            </Link>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {(products ?? [
              { id: 1, name: 'Large Package', priceRwf: 2000, packageType: 'large', description: '1 Large KosmoPad suitable for heavy flow' },
              { id: 2, name: 'Medium Package', priceRwf: 6000, packageType: 'medium', description: '5 Medium KosmoPads dignity kit' },
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
              <a href="mailto:digital@kosmotive.rw" className="bg-white/15 hover:bg-white/25 text-white px-8 py-4 rounded-xl font-semibold transition-all border border-white/30">
                Contact Us
              </a>
            </div>
          </motion.div>
        </div>
      </section>
    </div>
  );
};

export default HomePage;
