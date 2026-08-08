import React from 'react';
import { motion } from 'framer-motion';

// Rwandan shoppers overwhelmingly expect a WhatsApp line for quick
// questions before they trust a new online store — cheap to add, high
// trust payoff. Number matches the one already published in the Footer.
const WHATSAPP_NUMBER = '250788536350';
const MESSAGE = encodeURIComponent("Hi KosmoPads! I'd like to ask about your products.");

const WhatsAppButton: React.FC = () => (
  <motion.a
    href={`https://wa.me/${WHATSAPP_NUMBER}?text=${MESSAGE}`}
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Chat with us on WhatsApp"
    initial={{ scale: 0, opacity: 0 }}
    animate={{ scale: 1, opacity: 1 }}
    transition={{ delay: 1, type: 'spring', stiffness: 200 }}
    whileHover={{ scale: 1.08 }}
    whileTap={{ scale: 0.95 }}
    className="fixed bottom-5 right-5 z-40 w-14 h-14 bg-[#25D366] hover:bg-[#20bd5a] rounded-full shadow-xl shadow-black/20 flex items-center justify-center"
  >
    <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-40" />
    <svg viewBox="0 0 32 32" className="w-7 h-7 relative z-10 fill-white">
      <path d="M16.004 0C7.164 0 0 7.163 0 16.002c0 2.82.738 5.566 2.14 7.982L0 32l8.2-2.115a15.94 15.94 0 0 0 7.803 2.05h.006c8.838 0 16.002-7.163 16.002-16.001C31.998 7.163 24.836.002 16.004 0zm0 29.283a13.24 13.24 0 0 1-6.75-1.848l-.484-.287-4.865 1.255 1.298-4.744-.315-.487a13.222 13.222 0 0 1-2.03-7.17c0-7.31 5.948-13.258 13.25-13.258 3.54 0 6.868 1.38 9.37 3.884a13.166 13.166 0 0 1 3.877 9.38c-.003 7.31-5.951 13.257-13.25 13.257zm7.27-9.928c-.398-.199-2.355-1.162-2.72-1.295-.365-.133-.63-.199-.895.199-.265.398-1.028 1.295-1.26 1.56-.232.266-.464.299-.862.1-.398-.199-1.68-.619-3.2-1.974-1.183-1.055-1.982-2.358-2.214-2.756-.232-.398-.025-.613.174-.812.179-.178.398-.464.597-.696.2-.232.266-.398.398-.664.133-.265.067-.497-.033-.696-.1-.199-.895-2.157-1.226-2.954-.323-.776-.65-.671-.895-.684a17.2 17.2 0 0 0-.762-.014.146.146 0 0 0-.033 0c-.265 0-.696.099-1.06.497-.365.398-1.393 1.362-1.393 3.32s1.426 3.85 1.624 4.115c.199.265 2.807 4.287 6.8 6.011.95.41 1.692.655 2.27.839.954.303 1.822.26 2.508.158.765-.114 2.355-.963 2.687-1.893.332-.93.332-1.727.232-1.893-.1-.166-.365-.265-.763-.464z"/>
    </svg>
  </motion.a>
);

export default WhatsAppButton;
