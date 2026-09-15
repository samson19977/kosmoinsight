import React, { createContext, useContext, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { X, Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import ProductImage from '../components/ui/ProductImage';
import {
  type CartItem,
  addToCart as addToCartPure,
  updateQuantity as updateQuantityPure,
  removeFromCart as removeFromCartPure,
  calculateTotals,
} from '../utils/cart';

export type { CartItem };

interface CartContextType {
  items: CartItem[];
  addToCart: (product: any, quantity?: number) => void;
  removeFromCart: (id: number) => void;
  updateQuantity: (id: number, qty: number) => void;
  clearCart: () => void;
  totalItems: number;
  totalPrice: number;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
}

const CartContext = createContext<CartContextType | undefined>(undefined);

function CartSidebar() {
  const { items, removeFromCart, updateQuantity, totalItems, totalPrice, isOpen, closeCart, clearCart } = useCart();
  const navigate = useNavigate();

  const handleCheckout = () => { closeCart(); navigate('/checkout'); };

  return (
    <>
      {isOpen && <div className="fixed inset-0 bg-black/50 z-40 backdrop-blur-sm" onClick={closeCart} />}
      <div className={`fixed right-0 top-0 h-full w-full sm:w-96 bg-white shadow-2xl z-50 flex flex-col transition-transform duration-300 ease-in-out ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between bg-gradient-to-r from-primary-600 to-primary-700 text-white">
          <div className="flex items-center gap-2">
            <ShoppingCart size={22} />
            <div>
              <h2 className="text-lg font-bold leading-none">Your Cart</h2>
              <p className="text-xs text-primary-200 mt-0.5">{totalItems} item{totalItems !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={closeCart} className="p-2 hover:bg-white/20 rounded-full transition-colors"><X size={20} /></button>
        </div>

        {/* Items */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {items.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center py-16">
              <div className="w-20 h-20 rounded-full bg-primary-50 flex items-center justify-center mb-4">
                <ShoppingCart size={36} className="text-primary-300" />
              </div>
              <p className="text-gray-500 font-medium mb-1">Your cart is empty</p>
              <p className="text-sm text-gray-400 mb-5">Add products to get started</p>
              <button onClick={closeCart} className="text-primary-600 hover:text-primary-700 font-semibold text-sm">Browse Products →</button>
            </div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="flex gap-3 p-3 bg-gray-50 rounded-xl border border-gray-100">
                <div className="w-14 h-14 rounded-lg flex-shrink-0 overflow-hidden">
                  <ProductImage packageType={item.packageType} name={item.name} className="w-full h-full" emojiClassName="text-2xl" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-gray-900 truncate">{item.name}</p>
                  <p className="text-primary-600 font-bold text-sm">{(item.price * item.quantity).toLocaleString()} FRW</p>
                  <div className="flex items-center gap-2 mt-2">
                    <button onClick={() => updateQuantity(item.id, item.quantity - 1)} className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-primary-50 hover:border-primary-300 transition-colors"><Minus size={12} /></button>
                    <span className="text-sm font-semibold w-5 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.id, item.quantity + 1)} className="w-6 h-6 bg-white border border-gray-200 rounded-full flex items-center justify-center hover:bg-primary-50 hover:border-primary-300 transition-colors"><Plus size={12} /></button>
                    <button onClick={() => removeFromCart(item.id)} className="ml-1 text-red-400 hover:text-red-600 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {items.length > 0 && (
          <div className="p-4 border-t border-gray-100 space-y-3 bg-white">
            <div className="flex items-center justify-between text-sm text-gray-500">
              <span>Subtotal</span>
              <span className="text-xl font-bold text-gray-900">{totalPrice.toLocaleString()} <span className="text-sm font-normal">FRW</span></span>
            </div>
            <p className="text-xs text-gray-400">Delivery fee is paid separately by the client</p>
            <button onClick={handleCheckout} className="w-full bg-primary-600 hover:bg-primary-700 active:bg-primary-800 text-white py-3.5 rounded-xl font-semibold transition-colors shadow-lg shadow-primary-200">
              Proceed to Checkout →
            </button>
            <button onClick={clearCart} className="w-full text-sm text-gray-400 hover:text-red-500 transition-colors py-1">Clear Cart</button>
          </div>
        )}
      </div>
    </>
  );
}

export const CartProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<CartItem[]>(() => {
    try { return JSON.parse(localStorage.getItem('kos-cart') || '[]'); } catch { return []; }
  });
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    localStorage.setItem('kos-cart', JSON.stringify(items));
  }, [items]);

  const addToCart = (product: any, quantity = 1) => {
    setItems((prev) => {
      const result = addToCartPure(prev, product, quantity);
      if (result.capped) toast.error('Maximum 100 per item');
      return result.items;
    });
  };

  const removeFromCart = (id: number) => { setItems((p) => removeFromCartPure(p, id)); toast.success('Removed from cart'); };
  const updateQuantity = (id: number, qty: number) => {
    setItems((prev) => {
      const result = updateQuantityPure(prev, id, qty);
      if (result.capped) toast.error('Maximum 100 per item');
      if (result.items.length < prev.length) toast.success('Removed from cart');
      return result.items;
    });
  };
  const clearCart = () => { setItems([]); };
  const { totalItems, totalPrice } = calculateTotals(items);

  return (
    <CartContext.Provider value={{ items, addToCart, removeFromCart, updateQuantity, clearCart, totalItems, totalPrice, isOpen, openCart: () => setIsOpen(true), closeCart: () => setIsOpen(false) }}>
      {children}
      <CartSidebar />
    </CartContext.Provider>
  );
};

export const useCart = () => {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used inside CartProvider');
  return ctx;
};
