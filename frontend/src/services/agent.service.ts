import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
const TOKEN_KEY = 'kosmopads_agent_token';

export const agentApi = axios.create({
  baseURL: API_URL,
  headers: { 'Content-Type': 'application/json' },
  timeout: 15000,
});

agentApi.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

agentApi.interceptors.response.use(
  (res) => res,
  (err) => {
    const message = err.response?.data?.error || err.message || 'Something went wrong';
    return Promise.reject(new Error(message));
  }
);

export function getAgentToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}
export function setAgentToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearAgentToken() {
  localStorage.removeItem(TOKEN_KEY);
}

// ============================================
// Types (mirrors backend responses — see backend/src/routes/agent-self.ts)
// ============================================
export interface Agent {
  id: number;
  name: string;
  code: string;
  phone: string;
  email: string | null;
  status: 'pending' | 'active' | 'approved' | 'suspended' | 'rejected';
  commissionRateBps: number;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  createdAt?: string;
  lastLoginAt?: string | null;
}

export interface AgentDashboard {
  salesToday: number;
  salesLast7Days: number;
  salesLast30Days: number;
  salesTotal: number;
  customerCount: number;
  orderCount: number;
  pendingCommissionRwf: number;
  paidCommissionRwf: number;
  activePayGoLoans: number;
  payGoOutstandingRwf: number;
}

export interface AgentCustomer {
  id: number;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  district?: string | null;
  sector?: string | null;
  cell?: string | null;
  village?: string | null;
  nationalId?: string | null;
  createdAt?: string;
}

export interface AgentOrder {
  id: number;
  orderNumber: string;
  customerId: number;
  totalRwf: number;
  paymentMethod: string;
  paymentStatus: string;
  orderStatus: string;
  channel: string;
  createdAt: string;
}

export interface AgentCommission {
  id: number;
  agentId: number;
  orderId: number;
  saleAmountRwf: number;
  commissionRwf: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected' | 'cancelled';
  createdAt: string;
  paidAt?: string | null;
}

export interface RegisterAgentInput {
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  nationalId: string;
  district: string;
  sector: string;
  cell: string;
  village: string;
  password: string;
  confirmPassword: string;
}

export interface NewCustomerInput {
  firstName: string;
  lastName: string;
  phone: string;
  email?: string;
  nationalId?: string;
  district?: string;
  sector?: string;
  cell?: string;
  village?: string;
}

export interface AgentOrderItem {
  name: string;
  quantity: number;
  price: number;
  productId?: number;
}

export interface AgentOrderInstallmentPlan {
  downPaymentRwf: number;
  termMonths: number;
  interestRateBps?: number;
  guarantorName?: string;
  guarantorPhone?: string;
  // Backend requires this to be true before it will open a PayGo loan —
  // it's the server-side record that the customer reviewed and accepted
  // the terms shown on screen, not just a UI-only checkbox.
  agreementAccepted: boolean;
}

export interface CreateAgentOrderInput {
  customerId?: number;
  customer?: NewCustomerInput;
  items: AgentOrderItem[];
  paymentMethod: 'Mobile Money (MTN / Airtel)' | 'Cash on Delivery' | 'PayGo Installments';
  installmentPlan?: AgentOrderInstallmentPlan;
  notes?: string;
}

// ============================================
// API calls
// ============================================
export async function registerAgent(input: RegisterAgentInput) {
  const { data } = await agentApi.post('/agents/register', input);
  return data as { success: boolean; message: string; agentCode: string };
}

export async function loginAgent(identifier: string, password: string) {
  const { data } = await agentApi.post('/agents/login', { identifier, password });
  return data as { success: boolean; token: string; agent: Agent };
}

export async function fetchMyAgent() {
  const { data } = await agentApi.get('/agents/me');
  return data.agent as Agent;
}

export async function fetchMyDashboard() {
  const { data } = await agentApi.get('/agents/dashboard');
  return data as AgentDashboard & { success: boolean };
}

export async function fetchMyReferral() {
  const { data } = await agentApi.get('/agents/referral');
  return data as { success: boolean; agentCode: string; referralUrl: string };
}

export interface PaginationInfo {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface PaginatedResult<T> {
  data: T[];
  pagination: PaginationInfo;
}

export async function fetchMyCustomers(params: { page?: number; pageSize?: number; search?: string } = {}) {
  const { data } = await agentApi.get('/agents/customers', { params });
  return data as PaginatedResult<AgentCustomer> & { success: boolean };
}

export function myCustomersCsvUrl(search?: string) {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  return `${API_URL}/agents/customers/export/csv?${qs.toString()}`;
}

// CSV export is an authenticated route, so it can't just be a plain <a
// href> link — fetched via agentApi (which attaches the bearer token)
// and turned into a client-side blob download instead.
export async function downloadMyCustomersCsv(search?: string) {
  const { data } = await agentApi.get('/agents/customers/export/csv', { params: search ? { search } : {}, responseType: 'blob' });
  triggerCsvDownload(data, `my-customers-${new Date().toISOString().slice(0, 10)}.csv`);
}

export async function fetchMyCustomerDetail(id: number) {
  const { data } = await agentApi.get(`/agents/customers/${id}`);
  return data as { customer: AgentCustomer; orders: AgentOrder[]; loans: any[] };
}

export async function createMyCustomer(input: NewCustomerInput) {
  const { data } = await agentApi.post('/agents/customers', input);
  return data as { success: boolean; customer: AgentCustomer; reused: boolean };
}

export async function fetchMyOrders(params: { page?: number; pageSize?: number; search?: string } = {}) {
  const { data } = await agentApi.get('/agents/orders', { params });
  return data as PaginatedResult<AgentOrder> & { success: boolean };
}

export function myOrdersCsvUrl(search?: string) {
  const qs = new URLSearchParams();
  if (search) qs.set('search', search);
  return `${API_URL}/agents/orders/export/csv?${qs.toString()}`;
}

export async function downloadMyOrdersCsv(search?: string) {
  const { data } = await agentApi.get('/agents/orders/export/csv', { params: search ? { search } : {}, responseType: 'blob' });
  triggerCsvDownload(data, `my-orders-${new Date().toISOString().slice(0, 10)}.csv`);
}

function triggerCsvDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export async function createMyOrder(input: CreateAgentOrderInput) {
  const { data } = await agentApi.post('/agents/orders', input);
  return data as {
    success: boolean;
    orderNumber: string;
    orderId: number;
    total: number;
    loan: { loanNumber: string; principalRwf: number; downPaymentRwf: number; totalPayableRwf: number; termMonths: number } | null;
  };
}

export async function fetchMyCommissions() {
  const { data } = await agentApi.get('/agents/commissions');
  return data.commissions as AgentCommission[];
}

export async function fetchMyPayouts() {
  const { data } = await agentApi.get('/agents/payouts');
  return data.payouts as AgentCommission[];
}

export async function collectInstallment(loanNumber: string, installmentId: number, amountRwf: number, method: 'cash' | 'momo' | 'bank', note?: string) {
  const { data } = await agentApi.post(`/agents/loans/${loanNumber}/installments/${installmentId}/pay`, { amountRwf, method, note });
  return data;
}
