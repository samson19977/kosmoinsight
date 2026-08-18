import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { CartProvider } from './context/CartContext';
import { AgentAuthProvider } from './context/AgentAuthContext';
import { captureReferralFromUrl } from './utils/referral';
import Layout from './components/layout/Layout';
import AgentProtectedRoute from './components/agent/AgentProtectedRoute';
import HomePage from './pages/HomePage';
import ProductsPage from './pages/ProductsPage';
import ProductDetailPage from './pages/ProductDetailPage';
import CheckoutPage from './pages/CheckoutPage';
import OrderConfirmationPage from './pages/OrderConfirmationPage';
import OrderStatusPage from './pages/OrderStatusPage';
import NotFoundPage from './pages/NotFoundPage';
import BecomeAgentPage from './pages/agent/BecomeAgentPage';
import AgentRegisterPage from './pages/agent/AgentRegisterPage';
import AgentLoginPage from './pages/agent/AgentLoginPage';
import AgentDashboardPage from './pages/agent/AgentDashboardPage';
import AgentCustomersPage from './pages/agent/AgentCustomersPage';
import AgentOrdersPage from './pages/agent/AgentOrdersPage';
import AgentNewOrderPage from './pages/agent/AgentNewOrderPage';
import AgentCommissionsPage from './pages/agent/AgentCommissionsPage';
import AgentReferralPage from './pages/agent/AgentReferralPage';
import AgentProfilePage from './pages/agent/AgentProfilePage';
import ScrollToTop from './components/ui/ScrollToTop';
import WhatsAppButton from './components/ui/WhatsAppButton';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, staleTime: 5 * 60 * 1000 } },
});

// Captures ?ref=KOS001 on any page (homepage, a shared product link, etc.)
// and persists first-touch attribution — see utils/referral.ts.
const ReferralCapture: React.FC = () => {
  const location = useLocation();
  useEffect(() => {
    captureReferralFromUrl(location.search);
  }, [location.search]);
  return null;
};

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <CartProvider>
          <AgentAuthProvider>
            <ScrollToTop />
            <ReferralCapture />
            <Routes>
              {/* Storefront + public agent pages share the customer site chrome */}
              <Route
                path="/*"
                element={
                  <Layout>
                    <Routes>
                      <Route path="/" element={<HomePage />} />
                      <Route path="products" element={<ProductsPage />} />
                      <Route path="products/:id" element={<ProductDetailPage />} />
                      <Route path="checkout" element={<CheckoutPage />} />
                      <Route path="order-confirmation/:orderNumber" element={<OrderConfirmationPage />} />
                      <Route path="order-status" element={<OrderStatusPage />} />
                      <Route path="order-status/:orderNumber" element={<OrderStatusPage />} />
                      <Route path="become-an-agent" element={<BecomeAgentPage />} />
                      <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                  </Layout>
                }
              />

              {/* Agent auth — its own chrome-free pages */}
              <Route path="/agent/register" element={<AgentRegisterPage />} />
              <Route path="/agent/login" element={<AgentLoginPage />} />

              {/* Agent dashboard — sidebar shell, requires an active session */}
              <Route path="/agent/dashboard" element={<AgentProtectedRoute><AgentDashboardPage /></AgentProtectedRoute>} />
              <Route path="/agent/customers" element={<AgentProtectedRoute><AgentCustomersPage /></AgentProtectedRoute>} />
              <Route path="/agent/orders" element={<AgentProtectedRoute><AgentOrdersPage /></AgentProtectedRoute>} />
              <Route path="/agent/orders/new" element={<AgentProtectedRoute><AgentNewOrderPage /></AgentProtectedRoute>} />
              <Route path="/agent/commissions" element={<AgentProtectedRoute><AgentCommissionsPage /></AgentProtectedRoute>} />
              <Route path="/agent/referral" element={<AgentProtectedRoute><AgentReferralPage /></AgentProtectedRoute>} />
              <Route path="/agent/profile" element={<AgentProtectedRoute><AgentProfilePage /></AgentProtectedRoute>} />
            </Routes>
          </AgentAuthProvider>
          <WhatsAppButton />
          <Toaster
            position="top-center"
            toastOptions={{
              duration: 3500,
              style: { background: '#1e293b', color: '#f8fafc', borderRadius: '12px', padding: '12px 16px' },
              success: { iconTheme: { primary: '#22c55e', secondary: '#fff' } },
              error: { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
            }}
          />
        </CartProvider>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
