import React, { useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Minus, Plus, ShoppingCart, ArrowLeft, ChevronRight, ShieldCheck, Truck, Leaf, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { useProduct, useProducts } from '../hooks/useProducts';
import { useCart } from '../context/CartContext';
import ProductImage, { packageEmoji } from '../components/ui/ProductImage';
import { Skeleton } from '../components/ui/Skeleton';

const ProductDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const productId = Number(id);
  const { product, isLoading } = useProduct(productId);
  const { products } = useProducts();
  const { addToCart, openCart } = useCart();
  const [qty, setQty] = useState(1);

  const dec = () => setQty((q) => Math.max(1, q - 1));
  const inc = () => setQty((q) => Math.min(100, q + 1));

  const handleAdd = () => {
    if (!product) return;
    addToCart(product, qty);
    toast.success(`${qty} × ${product.name} added!`);
    openCart();
  };

  const related = (products ?? [])
    .filter((p) => p.id !== productId && (!product || p.packageType === product.packageType))
    .slice(0, 4);
  const relatedFallback = (products ?? []).filter((p) => p.id !== productId).slice(0, 4);
  const relatedList = related.length > 0 ? related : relatedFallback;

  if (isLoading) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-5xl">
        <div className="grid md:grid-cols-2 gap-10">
          <Skeleton className="h-80 md:h-[420px] w-full rounded-3xl" />
          <div className="space-y-4 pt-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-3/4" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-10 w-40 mt-6" />
            <Skeleton className="h-12 w-full mt-8 rounded-xl" />
          </div>
        </div>
      </div>
    );
  }

  if (!product) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center bg-gray-50">
        <div className="text-center max-w-sm mx-auto px-4">
          <div className="text-5xl mb-4">📦</div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">Product not found</h2>
          <p className="text-gray-500 text-sm mb-5">This product may no longer be available.</p>
          <Link to="/products" className="inline-flex items-center gap-2 bg-primary-600 text-white px-5 py-2.5 rounded-xl font-semibold text-sm">
            <ArrowLeft size={16} /> Back to Products
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-6 max-w-5xl">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-6">
          <Link to="/" className="hover:text-primary-600 transition-colors">Home</Link>
          <ChevronRight size={12} />
          <Link to="/products" className="hover:text-primary-600 transition-colors">Products</Link>
          <ChevronRight size={12} />
          <span className="text-gray-600 font-medium truncate">{product.name}</span>
        </div>

        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="grid md:grid-cols-2 gap-8 md:gap-12">
          {/* Image */}
          <div className="bg-white rounded-3xl shadow-card overflow-hidden border border-gray-100 h-80 md:h-[420px] sticky top-20">
            <ProductImage
              packageType={product.packageType}
              imageUrl={product.imageUrl}
              name={product.name}
              className="w-full h-full"
              emojiClassName="text-8xl drop-shadow"
            />
          </div>

          {/* Details */}
          <div>
            {product.packageType && (
              <span className="inline-flex items-center gap-1.5 bg-primary-50 text-primary-700 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wide mb-3">
                {packageEmoji[product.packageType] ?? '📦'} {product.packageType}
              </span>
            )}

            <h1 className="font-display text-2xl md:text-3xl font-extrabold text-gray-900 mb-2">{product.name}</h1>

            <div className="flex items-center gap-1 mb-4 text-accent-400">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} size={15} fill="currentColor" />)}
              <span className="text-xs text-gray-400 ml-1.5">Trusted by Rwandan women</span>
            </div>

            <p className="text-gray-500 leading-relaxed mb-6">{product.description}</p>

            <div className="flex items-baseline gap-2 mb-6">
              <span className="text-3xl font-bold text-primary-600">{product.priceRwf.toLocaleString()}</span>
              <span className="text-sm text-gray-400 font-medium">FRW</span>
            </div>

            {/* Quantity + Add to cart */}
            <div className="flex items-center gap-4 mb-6">
              <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden bg-white">
                <button onClick={dec} className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500 disabled:opacity-40" disabled={qty <= 1}>
                  <Minus size={16} />
                </button>
                <span className="w-12 text-center font-bold text-gray-900">{qty}</span>
                <button onClick={inc} className="w-11 h-11 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-500 disabled:opacity-40" disabled={qty >= 100}>
                  <Plus size={16} />
                </button>
              </div>
              <button
                onClick={handleAdd}
                className="flex-1 bg-primary-600 hover:bg-primary-700 text-white py-3.5 rounded-xl font-bold transition-all hover:scale-[1.02] shadow-lg shadow-primary-200 flex items-center justify-center gap-2"
              >
                <ShoppingCart size={18} /> Add to Cart — {(product.priceRwf * qty).toLocaleString()} FRW
              </button>
            </div>

            {/* Trust badges */}
            <div className="grid grid-cols-3 gap-3 mb-6">
              {[
                { icon: Leaf, label: 'Eco-Friendly' },
                { icon: ShieldCheck, label: 'Quality Tested' },
                { icon: Truck, label: 'Rwanda Delivery' },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex flex-col items-center text-center gap-1.5 bg-white border border-gray-100 rounded-xl p-3">
                  <Icon size={18} className="text-primary-500" />
                  <span className="text-[11px] text-gray-500 font-medium leading-tight">{label}</span>
                </div>
              ))}
            </div>

            <button onClick={() => navigate('/products')} className="text-sm text-gray-400 hover:text-primary-600 transition-colors flex items-center gap-1.5">
              <ArrowLeft size={14} /> Continue Shopping
            </button>
          </div>
        </motion.div>

        {/* Related products */}
        {relatedList.length > 0 && (
          <div className="mt-16">
            <h2 className="text-xl font-display font-bold text-gray-900 mb-5">You may also like</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
              {relatedList.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 12 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Link
                    to={`/products/${p.id}`}
                    className="group block bg-white rounded-2xl shadow-card hover:shadow-card-hover border border-gray-100 overflow-hidden transition-all duration-300"
                  >
                    <div className="h-36 relative">
                      <ProductImage
                        packageType={p.packageType}
                        imageUrl={p.imageUrl}
                        name={p.name}
                        className="w-full h-full"
                        emojiClassName="text-5xl group-hover:scale-110 transition-transform duration-300"
                      />
                    </div>
                    <div className="p-3">
                      <h3 className="font-semibold text-gray-900 text-xs mb-1 line-clamp-1">{p.name}</h3>
                      <span className="text-sm font-bold text-primary-600">{p.priceRwf.toLocaleString()} <span className="text-[10px] font-normal text-gray-400">FRW</span></span>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductDetailPage;
