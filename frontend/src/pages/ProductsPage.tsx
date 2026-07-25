import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Filter, X, ShoppingCart, Package, ArrowRight } from 'lucide-react';
import { useProducts } from '../hooks/useProducts';
import { useCart } from '../context/CartContext';
import ProductImage, { packageEmoji } from '../components/ui/ProductImage';
import { ProductGridSkeleton } from '../components/ui/Skeleton';
import toast from 'react-hot-toast';
import { Link } from 'react-router-dom';

const PACKAGE_TYPES = ['All', 'Large', 'Medium', 'Small', 'Nursing', 'Mix', 'Pantyliner'];

const ProductsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('All');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { products, isLoading, error } = useProducts();
  const { addToCart, openCart } = useCart();

  const filtered = useMemo(() => {
    const list = products ?? [];
    return list.filter((p) => {
      const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.description?.toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'All' || p.packageType === filterType.toLowerCase();
      return matchSearch && matchType;
    });
  }, [products, search, filterType]);

  const handleAdd = (p: any) => {
    addToCart(p);
    toast.success(`${p.name} added!`);
    openCart();
  };

  if (error) return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-sm mx-auto">
        <div className="text-5xl mb-4">😕</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Could not load products</h2>
        <p className="text-gray-500 text-sm mb-4">Make sure your backend is running at <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">{import.meta.env.VITE_API_URL}</code></p>
        <button onClick={() => window.location.reload()} className="bg-primary-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm">Try Again</button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Hero banner */}
      <div className="bg-gradient-to-r from-primary-700 to-primary-600 text-white py-12">
        <div className="container mx-auto px-4">
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
            <h1 className="font-display text-4xl md:text-5xl font-extrabold mb-2">Our Products</h1>
            <p className="text-primary-200 text-lg">Quality menstrual pads for every need</p>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Search + Filter Bar */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
          className="flex flex-col sm:flex-row gap-3 mb-6"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder="Search products..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 bg-white border border-gray-200 rounded-xl shadow-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent text-sm"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                <X size={16} />
              </button>
            )}
          </div>
          <button
            onClick={() => setFiltersOpen((v) => !v)}
            className={`flex items-center gap-2 px-5 py-3 rounded-xl border text-sm font-medium transition-colors ${filtersOpen ? 'bg-primary-600 text-white border-primary-600' : 'bg-white border-gray-200 text-gray-700 hover:border-primary-400'}`}
          >
            <Filter size={16} /> Filters {filterType !== 'All' && <span className="bg-accent-400 text-primary-900 text-xs font-bold px-1.5 rounded-full">1</span>}
          </button>
        </motion.div>

        {/* Filter Panel */}
        <AnimatePresence>
          {filtersOpen && (
            <motion.div
              initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
              className="bg-white rounded-2xl shadow-card p-5 mb-6 overflow-hidden border border-gray-100"
            >
              <p className="text-sm font-semibold text-gray-700 mb-3">Package Type</p>
              <div className="flex flex-wrap gap-2">
                {PACKAGE_TYPES.map((t) => (
                  <button
                    key={t}
                    onClick={() => setFilterType(t)}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium border transition-all ${filterType === t ? 'bg-primary-600 text-white border-primary-600 shadow-md' : 'bg-white text-gray-600 border-gray-200 hover:border-primary-400'}`}
                  >
                    {packageEmoji[t.toLowerCase()] && `${packageEmoji[t.toLowerCase()]} `}{t}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Results count */}
        {!isLoading && (
          <p className="text-sm text-gray-500 mb-5">{filtered.length} product{filtered.length !== 1 ? 's' : ''} found</p>
        )}

        {/* Grid */}
        {isLoading ? (
          <ProductGridSkeleton count={8} />
        ) : filtered.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
            {filtered.map((product, i) => (
              <motion.div
                key={product.id}
                initial={{ opacity: 0, scale: 0.92 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="group bg-white rounded-2xl shadow-card hover:shadow-card-hover border border-gray-100 overflow-hidden transition-all duration-300 flex flex-col"
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
                <div className="p-4 flex flex-col flex-1">
                  <Link to={`/products/${product.id}`} className="flex-1">
                    <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1 group-hover:text-primary-600 transition-colors">{product.name}</h3>
                    <p className="text-xs text-gray-400 mb-3 line-clamp-2">{product.description}</p>
                  </Link>
                  <div className="flex items-center justify-between mt-auto">
                    <div>
                      <span className="text-lg font-bold text-primary-600">{product.priceRwf.toLocaleString()}</span>
                      <span className="text-xs text-gray-400 ml-1">FRW</span>
                    </div>
                    <button
                      onClick={() => handleAdd(product)}
                      className="bg-primary-600 hover:bg-primary-700 text-white p-2.5 rounded-xl transition-all hover:scale-105 shadow-md shadow-primary-200"
                    >
                      <ShoppingCart size={16} />
                    </button>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        ) : (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">🔍</div>
            <p className="text-gray-700 font-semibold mb-1">No products match your search</p>
            <p className="text-gray-400 text-sm mb-4">Try different keywords or clear your filters</p>
            <button onClick={() => { setSearch(''); setFilterType('All'); }} className="text-primary-600 font-semibold text-sm hover:underline">Clear Filters</button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductsPage;
