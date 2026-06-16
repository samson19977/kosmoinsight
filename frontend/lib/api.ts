/**
 * KosmoInsight AI — API client v2
 * All routes now use /api/v1/* (old /api/* still work via backend compat layer)
 * New: installments, notifications, audit, users, WebSocket helper
 */

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function token() {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kosmo_token");
}

async function req<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const t = token();
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(t ? { Authorization: `Bearer ${t}` } : {}),
      ...opts.headers,
    },
  });
  if (res.status === 401) {
    localStorage.clear();
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }
  if (res.status === 403) throw new Error("⛔ Access denied. You don't have permission for this action.");
  if (res.status === 429) throw new Error("⏱ Too many requests — please wait a moment and try again.");
  if (!res.ok) {
    const e = await res.json().catch(() => ({ detail: "Error" }));
    throw new Error(e.detail || "Request failed");
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

/** Direct CSV download — opens in Excel */
export function downloadCSV(path: string, filename: string) {
  const t = token();
  fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${t}` } })
    .then(res => res.blob())
    .then(blob => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    });
}

/** Ping backend to wake Render free tier */
export function pingBackend() {
  fetch(`${API}/api/health`).catch(() => {});
}

/** WebSocket connection to real-time dashboard feed */
export function connectDashboardWS(
  onMessage: (data: Record<string, unknown>) => void,
  onOpen?: () => void,
) {
  const wsUrl = API.replace(/^http/, "ws") + "/ws/dashboard";
  const ws = new WebSocket(wsUrl);
  ws.onopen = () => onOpen?.();
  ws.onmessage = (e) => {
    try { onMessage(JSON.parse(e.data)); } catch { /* ignore malformed */ }
  };
  ws.onerror = () => {}; // silent — WS is optional enhancement
  return ws;
}

// ─── Base prefix ──────────────────────────────────────────────────────────────
const V1 = "/api/v1";

export const api = {
  // ── Customers ──────────────────────────────────────────────────────────────
  customers: {
    list: (params?: Record<string, string>) => {
      const merged = { limit: "1000", ...params };
      return req<Customer[]>(`${V1}/customers?${new URLSearchParams(merged)}`);
    },
    get:    (id: number) => req<Customer>(`${V1}/customers/${id}`),
    create: (d: Partial<Customer>) => req<Customer>(`${V1}/customers`, { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: Partial<Customer>) => req<Customer>(`${V1}/customers/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete: (id: number) => req(`${V1}/customers/${id}`, { method: "DELETE" }),
    payments: (id: number) => req(`${V1}/customers/${id}/payments`),
  },

  // ── Payments ───────────────────────────────────────────────────────────────
  payments: {
    list: (params?: Record<string, string>) => {
      const merged = { limit: "2000", ...params };
      return req<Payment[]>(`${V1}/payments?${new URLSearchParams(merged)}`);
    },
    create: (d: unknown) => req<Payment>(`${V1}/payments`, { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: unknown) => req<Payment>(`${V1}/payments/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    autoRisk: (customerId: number, payments: Payment[]) => {
      const missed = payments.filter(p => p.status === "missed").length;
      return req(`${V1}/predict/repayment-risk`, {
        method: "POST",
        body: JSON.stringify({
          customer_id: customerId,
          missed_payments: missed,
          total_payments: Math.max(payments.length, 1),
          months_active: 3,
        }),
      });
    },
  },

  // ── Installments (NEW in v2) ───────────────────────────────────────────────
  installments: {
    list: (params?: Record<string, string>) =>
      req<Installment[]>(`${V1}/installments?${new URLSearchParams(params ?? {})}`),
    forCustomer: (customerId: number) =>
      req<Installment[]>(`${V1}/installments?customer_id=${customerId}&limit=200`),
    generate: (d: GenerateInstallmentsInput) =>
      req<Installment[]>(`${V1}/installments/generate`, { method: "POST", body: JSON.stringify(d) }),
    markPaid: (id: number, paidAmount?: number) =>
      req<Installment>(
        `${V1}/installments/${id}/mark-paid${paidAmount != null ? `?paid_amount=${paidAmount}` : ""}`,
        { method: "PATCH" }
      ),
    overdueSummary: () => req<OverdueSummary>(`${V1}/installments/overdue-summary`),
  },

  // ── Analytics ─────────────────────────────────────────────────────────────
  analytics: {
    dashboard:      () => req<DashboardStats>(`${V1}/analytics/dashboard`),
    revenueTrend:   () => req<TrendPoint[]>(`${V1}/analytics/revenue-trend`),
    repaymentTrend: () => req<TrendPoint[]>(`${V1}/analytics/repayment-trend`),
    riskDist:       () => req<RiskPoint[]>(`${V1}/analytics/risk-distribution`),
    regionDist:     () => req<RegionPoint[]>(`${V1}/analytics/region-distribution`),
    healthImpact:   () => req(`${V1}/analytics/health-impact`),
    insights:       () => req<Insight[]>(`${V1}/analytics/ai-insights`),
  },

  // ── Predictions ───────────────────────────────────────────────────────────
  predict: {
    batchRisk: () => req(`${V1}/predict/batch-risk-update`, { method: "POST" }),
    forecast:  (d: unknown) => req(`${V1}/predict/demand-forecast`, { method: "POST", body: JSON.stringify(d) }),
    segments:  () => req(`${V1}/predict/segmentation`),
  },

  // ── Reports ───────────────────────────────────────────────────────────────
  reports: {
    summary:      () => req(`${V1}/reports/summary`),
    donor:        () => req(`${V1}/reports/donor`),
    csvKpi:       () => downloadCSV(`${V1}/reports/summary/csv`,   `kpi-${today()}.csv`),
    csvCustomers: () => downloadCSV(`${V1}/reports/customers/csv`, `customers-${today()}.csv`),
    csvPayments:  () => downloadCSV(`${V1}/reports/payments/csv`,  `payments-${today()}.csv`),
  },

  // ── Health sessions ───────────────────────────────────────────────────────
  health: {
    list:   () => req(`${V1}/health-sessions`),
    create: (d: unknown) => req(`${V1}/health-sessions`, { method: "POST", body: JSON.stringify(d) }),
    delete: (id: number) => req(`${V1}/health-sessions/${id}`, { method: "DELETE" }),
  },

  // ── Products ──────────────────────────────────────────────────────────────
  products: {
    list:            () => req(`${V1}/products`),
    lowStock:        () => req(`${V1}/products/low-stock`),
    update:          (id: number, d: unknown) => req(`${V1}/products/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete:          (id: number) => req(`${V1}/products/${id}`, { method: "DELETE" }),
    distributions:   () => req(`${V1}/products/distributions`),
    addDistribution: (d: unknown) => req(`${V1}/products/distributions`, { method: "POST", body: JSON.stringify(d) }),
  },

  // ── Notifications (NEW in v2) ──────────────────────────────────────────────
  notifications: {
    list:   (params?: Record<string, string>) =>
      req<Notification[]>(`${V1}/notifications?${new URLSearchParams(params ?? {})}`),
    create: (d: Partial<Notification>) =>
      req<Notification>(`${V1}/notifications`, { method: "POST", body: JSON.stringify(d) }),
    unreadCount: () => req<{ count: number }>(`${V1}/notifications/unread-count`),
  },

  // ── Audit (NEW in v2 — admin only) ────────────────────────────────────────
  audit: {
    list: (params?: Record<string, string>) =>
      req<AuditLog[]>(`${V1}/audit?${new URLSearchParams(params ?? {})}`),
  },

  // ── Users (admin) ─────────────────────────────────────────────────────────
  users: {
    list:       () => req<User[]>(`${V1}/auth/users`),
    update:     (id: number, d: Partial<User>) => req<User>(`${V1}/auth/users/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    deactivate: (id: number) => req(`${V1}/auth/users/${id}`, { method: "DELETE" }),
  },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function today() { return new Date().toISOString().slice(0, 10); }

// ─── Types ────────────────────────────────────────────────────────────────────
export interface Customer {
  id: number; name: string; phone: string; location?: string; region?: string;
  product_type?: string; payment_plan?: string; status: string;
  risk_score: number; risk_level: string; join_date: string; total_debt?: number;
}
export interface Payment {
  id: number; customer_id: number; amount_due: number; amount_paid: number;
  remaining_balance?: number; due_date?: string; paid_date?: string;
  status: string; installment_number?: number;
}
export interface Installment {
  id: number; customer_id: number; installment_no: number;
  amount_due: number; paid_amount: number; due_date: string;
  paid_date?: string; status: "pending" | "paid" | "missed" | "partial";
  frequency?: string; reminder_sent?: boolean;
}
export interface GenerateInstallmentsInput {
  customer_id: number; total_amount: number; num_installments: number;
  start_date: string; frequency: "daily" | "weekly" | "monthly";
}
export interface OverdueSummary {
  total_overdue: number; total_amount_overdue: number; by_customer: Array<{
    customer_id: number; customer_name: string; overdue_count: number; amount_overdue: number;
  }>;
}
export interface DashboardStats {
  total_customers: number; active_customers: number; total_revenue: number;
  repayment_rate: number; high_risk_count: number; medium_risk_count: number;
  products_distributed: number; health_sessions_count: number;
  this_month_revenue: number; revenue_change_pct: number;
  outstanding_debt: number; overdue_installments: number;
}
export interface TrendPoint  { month: string; revenue?: number; rate?: number; }
export interface RiskPoint   { name: string; value: number; }
export interface RegionPoint { region: string; count: number; }
export interface Insight     { type: "warning" | "info" | "success"; message: string; }
export interface Notification {
  id: number; customer_id?: number; channel: "sms" | "email" | "whatsapp" | "in_app";
  message: string; status: "pending" | "sent" | "failed"; created_at: string; sent_at?: string;
}
export interface AuditLog {
  id: number; user_id?: number; user_email?: string; action: string;
  resource: string; resource_id?: number; detail?: string;
  ip_address?: string; created_at: string;
}
export interface User {
  id: number; name: string; email: string; role: string;
  is_active: boolean; last_login?: string; created_at: string;
}
