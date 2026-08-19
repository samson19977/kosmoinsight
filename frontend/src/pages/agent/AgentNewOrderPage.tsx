import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import toast from 'react-hot-toast';
import {
  Loader2, Search, Plus, Minus, Trash2, ShoppingBag, User, CreditCard,
  Banknote, Smartphone, Landmark, CheckCircle2, ArrowRight, ArrowLeft,
} from 'lucide-react';
import { fetchProducts, type Product } from '../../services/products.service';
import {
  fetchMyCustomers, createMyOrder, type AgentCustomer, type NewCustomerInput, type CreateAgentOrderInput,
} from '../../services/agent.service';
import { formatRwf } from '../../components/agent/StatCard';

type CartLine = { productId: number; name: string; price: number; quantity: number; installmentEligible?: boolean };
type PaymentChoice = 'Cash on Delivery' | 'Mobile Money (MTN / Airtel)' | 'PayGo Installments';

const inputCls = 'w-full px-3.5 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400 focus:border-transparent bg-white transition-all';
const emptyNewCustomer: NewCustomerInput = { firstName: '', lastName: '', phone: '', email: '', nationalId: '', district: '', sector: '', cell: '', village: '' };

const AgentNewOrderPage: React.FC = () => {
  const navigate = useNavigate();

  // ---- customer selection ----
  const [customerMode, setCustomerMode] = useState<'existing' | 'new'>('existing');
  const [customerSearch, setCustomerSearch] = useState('');
  const [debouncedCustomerSearch, setDebouncedCustomerSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<AgentCustomer | null>(null);
  const [newCustomer, setNewCustomer] = useState<NewCustomerInput>(emptyNewCustomer);

  // Debounced server-side search — matches the same pagination/search the
  // Customers page now uses, instead of pulling every customer into memory
  // just to filter a typeahead list.
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedCustomerSearch(customerSearch.trim()), 300);
    return () => clearTimeout(t);
  }, [customerSearch]);

  const { data: customersResult, isLoading: loadingCustomers } = useQuery({
    queryKey: ['agent-customers-typeahead', debouncedCustomerSearch],
    queryFn: () => fetchMyCustomers({ page: 1, pageSize: 8, search: debouncedCustomerSearch || undefined }),
  });

  const filteredCustomers = customersResult?.data ?? [];

  // ---- product cart ----
  const { data: products, isLoading: loadingProducts } = useQuery({ queryKey: ['products'], queryFn: fetchProducts });
  const [cart, setCart] = useState<CartLine[]>([]);

  const addToCart = (p: Product) => {
    setCart((c) => {
      const existing = c.find((l) => l.productId === p.id);
      if (existing) return c.map((l) => (l.productId === p.id ? { ...l, quantity: l.quantity + 1 } : l));
      return [...c, { productId: p.id, name: p.name, price: p.priceRwf, quantity: 1, installmentEligible: p.installmentEligible }];
    });
  };
  const updateQty = (productId: number, qty: number) => {
    if (qty < 1) return;
    setCart((c) => c.map((l) => (l.productId === productId ? { ...l, quantity: qty } : l)));
  };
  const removeLine = (productId: number) => setCart((c) => c.filter((l) => l.productId !== productId));

  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);
  const allEligibleForPayGo = cart.length > 0 && cart.every((l) => l.installmentEligible);

  // ---- payment ----
  const [paymentMethod, setPaymentMethod] = useState<PaymentChoice>('Cash on Delivery');
  const [downPayment, setDownPayment] = useState<number>(0);
  const [termMonths, setTermMonths] = useState<number>(3);
  const [agreementAccepted, setAgreementAccepted] = useState(false);

  type OrderResult = { orderNumber: string; total: number; loan: { loanNumber: string; principalRwf: number; downPaymentRwf: number; totalPayableRwf: number; termMonths: number } | null };
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<OrderResult | null>(null);

  const canSubmit =
    cart.length > 0 &&
    (customerMode === 'existing' ? !!selectedCustomer : (newCustomer.firstName && newCustomer.lastName && newCustomer.phone)) &&
    (paymentMethod !== 'PayGo Installments' || (allEligibleForPayGo && downPayment > 0 && downPayment < cartTotal && agreementAccepted));

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const payload: CreateAgentOrderInput = {
        ...(customerMode === 'existing' ? { customerId: selectedCustomer!.id } : { customer: newCustomer }),
        items: cart.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price, productId: l.productId })),
        paymentMethod,
        ...(paymentMethod === 'PayGo Installments' ? { installmentPlan: { downPaymentRwf: downPayment, termMonths, agreementAccepted } } : {}),
      };
      const res = await createMyOrder(payload);
      setResult({ orderNumber: res.orderNumber, total: res.total, loan: res.loan });
      toast.success('Sale recorded!');
    } catch (err: any) {
      toast.error(err.message || 'Failed to create order');
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="max-w-lg mx-auto text-center py-12">
        <div className="w-16 h-16 bg-primary-100 rounded-2xl flex items-center justify-center mx-auto mb-5">
          <CheckCircle2 size={32} className="text-primary-600" />
        </div>
        <h1 className="text-2xl font-display font-bold text-gray-900 mb-2">Order created</h1>
        <p className="text-sm text-gray-500 mb-1">Order <span className="font-semibold text-gray-800">{result.orderNumber}</span> — {formatRwf(result.total)}</p>
        {result.loan && (
          <div className="bg-white rounded-2xl shadow-card p-5 mt-5 text-left text-sm space-y-1.5">
            <p className="font-display font-semibold text-gray-900 mb-2">PayGo loan {result.loan.loanNumber}</p>
            <div className="flex justify-between text-gray-500"><span>Financed principal</span><span className="text-gray-800 font-medium">{formatRwf(result.loan.principalRwf)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Down payment</span><span className="text-gray-800 font-medium">{formatRwf(result.loan.downPaymentRwf)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Total payable</span><span className="text-gray-800 font-medium">{formatRwf(result.loan.totalPayableRwf)}</span></div>
            <div className="flex justify-between text-gray-500"><span>Term</span><span className="text-gray-800 font-medium">{result.loan.termMonths} months</span></div>
          </div>
        )}
        <div className="flex gap-3 mt-8 justify-center">
          <button onClick={() => { setResult(null); setCart([]); setSelectedCustomer(null); setNewCustomer(emptyNewCustomer); setPaymentMethod('Cash on Delivery'); setAgreementAccepted(false); }} className="bg-primary-600 hover:bg-primary-700 text-white font-semibold px-5 py-2.5 rounded-xl transition-colors">
            Record another sale
          </button>
          <button onClick={() => navigate('/agent/orders')} className="bg-white border border-gray-200 text-gray-700 font-semibold px-5 py-2.5 rounded-xl transition-colors">
            View my orders
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-display font-bold text-gray-900 mb-6">New Sale</h1>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Left: customer + products */}
        <div className="lg:col-span-2 space-y-6">
          {/* Customer */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <User size={18} className="text-primary-600" />
              <h2 className="font-display font-semibold text-gray-900">Customer</h2>
            </div>
            <div className="flex gap-2 mb-4">
              <button onClick={() => setCustomerMode('existing')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${customerMode === 'existing' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>Existing customer</button>
              <button onClick={() => setCustomerMode('new')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${customerMode === 'new' ? 'bg-primary-600 text-white' : 'bg-gray-100 text-gray-600'}`}>New customer</button>
            </div>

            {customerMode === 'existing' ? (
              <div>
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={15} />
                  <input className="w-full pl-9 pr-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary-400" placeholder="Search by name or phone" value={customerSearch} onChange={(e) => { setCustomerSearch(e.target.value); setSelectedCustomer(null); }} />
                </div>
                {loadingCustomers ? (
                  <Loader2 className="animate-spin text-primary-600 mx-auto" size={20} />
                ) : selectedCustomer ? (
                  <div className="flex items-center justify-between bg-primary-50 rounded-lg px-3.5 py-2.5">
                    <span className="text-sm font-medium text-gray-800">{selectedCustomer.firstName} {selectedCustomer.lastName} · {selectedCustomer.phone}</span>
                    <button onClick={() => setSelectedCustomer(null)} className="text-xs text-gray-500 hover:text-red-500">Change</button>
                  </div>
                ) : (
                  <div className="space-y-1 max-h-52 overflow-y-auto">
                    {filteredCustomers.map((c) => (
                      <button key={c.id} onClick={() => setSelectedCustomer(c)} className="w-full text-left px-3.5 py-2.5 rounded-lg hover:bg-gray-50 text-sm flex justify-between">
                        <span className="font-medium text-gray-800">{c.firstName} {c.lastName}</span>
                        <span className="text-gray-400">{c.phone}</span>
                      </button>
                    ))}
                    {filteredCustomers.length === 0 && <p className="text-sm text-gray-400 px-3.5 py-2.5">No customers found — try "New customer".</p>}
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <input className={inputCls} placeholder="First name *" value={newCustomer.firstName} onChange={(e) => setNewCustomer((f) => ({ ...f, firstName: e.target.value }))} />
                <input className={inputCls} placeholder="Last name *" value={newCustomer.lastName} onChange={(e) => setNewCustomer((f) => ({ ...f, lastName: e.target.value }))} />
                <input className={inputCls} placeholder="Phone *" value={newCustomer.phone} onChange={(e) => setNewCustomer((f) => ({ ...f, phone: e.target.value }))} />
                <input className={inputCls} placeholder="Email" value={newCustomer.email} onChange={(e) => setNewCustomer((f) => ({ ...f, email: e.target.value }))} />
                <input className={inputCls} placeholder="National ID (for PayGo)" value={newCustomer.nationalId} onChange={(e) => setNewCustomer((f) => ({ ...f, nationalId: e.target.value }))} maxLength={16} />
                <input className={inputCls} placeholder="District" value={newCustomer.district} onChange={(e) => setNewCustomer((f) => ({ ...f, district: e.target.value }))} />
                <input className={inputCls} placeholder="Sector" value={newCustomer.sector} onChange={(e) => setNewCustomer((f) => ({ ...f, sector: e.target.value }))} />
                <input className={inputCls} placeholder="Cell" value={newCustomer.cell} onChange={(e) => setNewCustomer((f) => ({ ...f, cell: e.target.value }))} />
                <input className={inputCls} placeholder="Village" value={newCustomer.village} onChange={(e) => setNewCustomer((f) => ({ ...f, village: e.target.value }))} />
              </div>
            )}
          </div>

          {/* Products */}
          <div className="bg-white rounded-2xl shadow-card p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShoppingBag size={18} className="text-primary-600" />
              <h2 className="font-display font-semibold text-gray-900">Products</h2>
            </div>
            {loadingProducts ? (
              <Loader2 className="animate-spin text-primary-600 mx-auto" size={20} />
            ) : (
              <div className="grid sm:grid-cols-2 gap-2.5">
                {products?.map((p) => (
                  <button key={p.id} onClick={() => addToCart(p)} className="flex items-center justify-between px-3.5 py-3 rounded-lg border border-gray-100 hover:border-primary-300 hover:bg-primary-50 transition-colors text-left">
                    <div>
                      <p className="text-sm font-medium text-gray-800">{p.name}</p>
                      <p className="text-xs text-gray-400">{formatRwf(p.priceRwf)}{p.installmentEligible ? ' · PayGo eligible' : ''}</p>
                    </div>
                    <Plus size={16} className="text-primary-600 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: cart + payment */}
        <div className="space-y-6">
          <div className="bg-white rounded-2xl shadow-card p-5">
            <h2 className="font-display font-semibold text-gray-900 mb-4">Cart</h2>
            {cart.length === 0 ? (
              <p className="text-sm text-gray-400">Add products from the left to build this sale.</p>
            ) : (
              <div className="space-y-3">
                {cart.map((l) => (
                  <div key={l.productId} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{l.name}</p>
                      <p className="text-xs text-gray-400">{formatRwf(l.price)} each</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => updateQty(l.productId, l.quantity - 1)} className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-600"><Minus size={12} /></button>
                      <span className="w-5 text-center text-sm">{l.quantity}</span>
                      <button onClick={() => updateQty(l.productId, l.quantity + 1)} className="w-6 h-6 rounded-md bg-gray-100 flex items-center justify-center text-gray-600"><Plus size={12} /></button>
                      <button onClick={() => removeLine(l.productId)} className="text-gray-300 hover:text-red-500 ml-1"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                <div className="pt-3 border-t border-gray-100 flex justify-between font-display font-semibold text-gray-900">
                  <span>Total</span><span>{formatRwf(cartTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {cart.length > 0 && (
            <div className="bg-white rounded-2xl shadow-card p-5">
              <div className="flex items-center gap-2 mb-4">
                <CreditCard size={18} className="text-primary-600" />
                <h2 className="font-display font-semibold text-gray-900">Payment</h2>
              </div>
              <div className="grid grid-cols-1 gap-2 mb-4">
                {([
                  { val: 'Cash on Delivery' as const, icon: Banknote, label: 'Cash' },
                  { val: 'Mobile Money (MTN / Airtel)' as const, icon: Smartphone, label: 'MTN MoMo' },
                  { val: 'PayGo Installments' as const, icon: Landmark, label: 'PayGo Installments', disabled: !allEligibleForPayGo },
                ]).map(({ val, icon: Icon, label, disabled }) => (
                  <button
                    key={val}
                    disabled={disabled}
                    onClick={() => setPaymentMethod(val)}
                    className={`flex items-center gap-2.5 px-3.5 py-3 rounded-lg border text-sm font-medium transition-colors text-left ${
                      paymentMethod === val ? 'border-primary-500 bg-primary-50 text-primary-700' : disabled ? 'border-gray-100 text-gray-300 cursor-not-allowed' : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    <Icon size={16} /> {label}
                    {disabled && <span className="text-xs ml-auto">Not eligible</span>}
                  </button>
                ))}
              </div>

              {paymentMethod === 'PayGo Installments' && (
                <div className="space-y-3 border-t border-gray-100 pt-4">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Down payment (RWF)</label>
                    <input type="number" className={inputCls} value={downPayment || ''} onChange={(e) => setDownPayment(Number(e.target.value))} min={1} max={cartTotal - 1} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Term (months)</label>
                    <select className={inputCls} value={termMonths} onChange={(e) => setTermMonths(Number(e.target.value))}>
                      {[1, 2, 3, 6, 9, 12, 18, 24].map((m) => <option key={m} value={m}>{m} months</option>)}
                    </select>
                  </div>
                  <p className="text-xs text-gray-400">
                    Kosmotive's PayGo policy sets the final interest and repayment schedule — this is a proposed down
                    payment and term, confirmed once the order is submitted.
                  </p>
                  <label className="flex items-start gap-2 text-xs text-gray-600 pt-1">
                    <input type="checkbox" className="mt-0.5" checked={agreementAccepted} onChange={(e) => setAgreementAccepted(e.target.checked)} />
                    The customer has reviewed the total, down payment, and term above and accepts these PayGo terms.
                  </label>
                </div>
              )}

              <button
                onClick={handleSubmit}
                disabled={!canSubmit || submitting}
                className="w-full mt-5 bg-primary-600 hover:bg-primary-700 disabled:opacity-50 text-white font-semibold py-3.5 rounded-xl shadow-lg shadow-primary-200 transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="animate-spin" size={18} /> : <ArrowRight size={18} />}
                {submitting ? 'Creating order…' : 'Confirm Sale'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AgentNewOrderPage;
