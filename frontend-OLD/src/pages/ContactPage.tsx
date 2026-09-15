import React from 'react';
import { motion } from 'framer-motion';
import { Mail, Phone, MapPin, MessageCircle } from 'lucide-react';
import BackButton from '../components/common/BackButton';

// ============================================
// WHY THIS EXISTS: "Contact Us" and "Ask About PayGo" used to be plain
// <a href="mailto:..."> links — clicking them just tried to open the
// visitor's email client (which many phones aren't even configured for)
// straight to one address, with no phone number or location shown at
// all. A real contact page gives every channel at once, works the same
// on every device, and doesn't assume the visitor has email set up.
// ============================================
const contactMethods = [
  { icon: Mail, label: 'Email', value: 'digital@kosmotive.rw', href: 'mailto:digital@kosmotive.rw' },
  { icon: Phone, label: 'Phone', value: '+250 788 536 350', href: 'tel:+250788536350' },
  { icon: MapPin, label: 'Location', value: 'Kigali, Rwanda', href: null as string | null },
];

const ContactPage: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-lg mx-auto">
        <BackButton />
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-8">
          <div className="w-14 h-14 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <MessageCircle className="text-primary-600" size={26} />
          </div>
          <h1 className="text-2xl font-display font-bold text-gray-900">Get in Touch</h1>
          <p className="text-gray-500 mt-1 text-sm">Questions about an order, PayGo, or becoming an agent? Reach us any of these ways.</p>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }} className="bg-white rounded-2xl shadow-card divide-y divide-gray-100">
          {contactMethods.map(({ icon: Icon, label, value, href }) => {
            const content = (
              <div className="flex items-center gap-4 p-5">
                <div className="w-11 h-11 bg-primary-50 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Icon className="text-primary-600" size={20} />
                </div>
                <div>
                  <p className="text-xs text-gray-400">{label}</p>
                  <p className="font-semibold text-gray-900">{value}</p>
                </div>
              </div>
            );
            return href ? (
              <a key={label} href={href} className="block hover:bg-gray-50 transition-colors">{content}</a>
            ) : (
              <div key={label}>{content}</div>
            );
          })}
        </motion.div>

        <p className="text-center text-xs text-gray-400 mt-6">
          For a specific order, have your order number ready — it helps us help you faster.
        </p>
      </div>
    </div>
  );
};

export default ContactPage;
