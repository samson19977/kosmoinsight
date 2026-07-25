import React from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Home, Search, Leaf } from 'lucide-react';

const NotFoundPage: React.FC = () => (
  <div className="min-h-[80vh] flex items-center justify-center bg-gray-50 px-4">
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="text-center max-w-md"
    >
      <div className="relative w-28 h-28 mx-auto mb-6">
        <div className="absolute inset-0 bg-primary-100 rounded-full animate-pulse" />
        <div className="relative w-full h-full flex items-center justify-center">
          <Leaf size={48} className="text-primary-400" />
        </div>
      </div>
      <h1 className="font-display text-7xl font-extrabold text-primary-600 mb-2">404</h1>
      <h2 className="text-xl font-bold text-gray-900 mb-2">Page not found</h2>
      <p className="text-gray-500 text-sm mb-8">
        The page you're looking for doesn't exist or may have moved. Let's get you back on track.
      </p>
      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/" className="inline-flex items-center gap-2 bg-primary-600 hover:bg-primary-700 text-white px-6 py-3 rounded-xl font-semibold transition-all hover:scale-105 shadow-lg shadow-primary-200">
          <Home size={18} /> Back Home
        </Link>
        <Link to="/products" className="inline-flex items-center gap-2 bg-white border border-gray-200 hover:border-primary-400 text-gray-700 px-6 py-3 rounded-xl font-semibold transition-all">
          <Search size={18} /> Browse Products
        </Link>
      </div>
    </motion.div>
  </div>
);

export default NotFoundPage;
