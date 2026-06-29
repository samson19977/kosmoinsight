/**
 * KosmoInsight AI — API Client
 * All endpoints target /api/v1/ (backend v2 schema).
 * Reads NEXT_PUBLIC_API_URL from env (falls back to localhost:8000 for dev).
 */

const BASE = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").replace(/\/$/, "");

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kosmo_token");
}

async function request<T>(
  path: string,
  options: RequestInit = {},
  params?: Record<string, string>
): Promise<T> {
  const token = getToken();
  const url = new URL(`${BASE}${path}`);
  if (params) {
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== "") url.searchParams.set(k, v);
    });
  }
  const res = await fetch(url.toString(), {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    let msg = `API error ${res.status}`;
    try {
      const err = await res.json();
      msg = err.detail || err.message || JSON.stringify(err);
    } catch {
      msg = await res.text().catch(() => msg);
    }
    throw new Error(msg);
  }
  if (res.status === 204) return {} as T;
  return res.json() as Promise<T>;
}

async function downloadCsv(path: string, filename: string): Promise<void> {
  const token = getToken();
  const res = await fetch(`${BASE}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(`Download failed: ${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  location?: string;
  region: string;
  product_type?: string;
  payment_plan?: string;
  notes?: string;
  status: string;
  risk_score: number;
  risk_level: string;
  join_date: string;
  created_at?: string;
}

export interface Payment {
  id: number;
  customer_id: number;
  amount_due: number;
  amount_paid: number;
  remaining_balance?: number;
  installment_number?: number;
  status: string;
  due_date?: string | null;
  paid_date?: string | null;
  created_at?: string;
}

export interface Installment {
  id: number;
  customer_id: number;
  installment_no: number;
  amount_due: number;
  paid_amount: number;
  remaining_balance?: number;
  status: string;
  due_date?: string | null;
  paid_date?: string | null;
  created_at?: string;
}

export interface OverdueSummary {
  total_overdue: number;
  total_overdue_amount: number;
  by_region?: { region: string; count: number; amount: number }[];
}

export interface GenerateInstallmentsInput {
  customer_id: number;
  total_amount: number;
  num_installments: number;
  start_date?: string;
  frequency?: string;
}

export interface Notification {
  id: number;
  customer_id?: number;
  channel: string;
  message: string;
  status: string;
  sent_at?: string | null;
  created_at?: string;
}

export interface AuditLog {
  id: number;
  user_id?: number;
  action: string;
  resource: string;
  resource_id?: number;
  detail?: string;
  created_at: string;
}

export interface DashboardStats {
  total_customers: number;
  active_customers: number;
  repayment_rate: number;
  this_month_revenue: number;
  revenue_change_pct: number;
  high_risk_count: number;
  products_distributed: number;
  health_sessions_count: number;
}

export interface TrendPoint {
  month: string;
  revenue?: number;
  rate?: number;
}

export interface RiskPoint {
  name: string;
  value: number;
}

export interface RegionPoint {
  region: string;
  count: number;
}

export interface Insight {
  type: string;
  message: string;
}

export const api = {

  customers: {
    list(params?: Record<string, string>): Promise<Customer[]> {
      return request<Customer[]>("/api/v1/customers", {}, params);
    },
    get(id: number): Promise<Customer> {
      return request<Customer>(`/api/v1/customers/${id}`);
    },
    create(data: Partial<Customer>): Promise<Customer> {
      return request<Customer>("/api/v1/customers", { method: "POST", body: JSON.stringify(data) });
    },
    update(id: number, data: Partial<Customer>): Promise<Customer> {
      return request<Customer>(`/api/v1/customers/${id}`, { method: "PUT", body: JSON.stringify(data) });
    },
    delete(id: number): Promise<void> {
      return request<void>(`/api/v1/customers/${id}`, { method: "DELETE" });
    },
    payments(id: number): Promise<{ payments: Payment[] }> {
      return request<{ payments: Payment[] }>(`/api/v1/customers/${id}/payments`);
    },
  },

  payments: {
    list(params?: Record<string, string>): Promise<Payment[]> {
      return request<Payment[]>("/api/v1/payments", {}, params);
    },
    create(data: Partial<Payment>): Promise<Payment> {
      return request<Payment>("/api/v1/payments", { method: "POST", body: JSON.stringify(data) });
    },
    update(id: number, data: Partial<Payment>): Promise<Payment> {
      return request<Payment>(`/api/v1/payments/${id}`, { method: "PUT", body: JSON.stringify(data) });
    },
    async autoRisk(customerId: number, payments: Payment[]): Promise<void> {
      const missed = payments.filter((p) => p.status === "missed").length;
      const total = payments.length;
      const missedRate = total > 0 ? missed / total : 0;
      let risk_level = "low";
      if (missedRate >= 0.5) risk_level = "high";
      else if (missedRate >= 0.2) risk_level = "medium";
      await request<void>(`/api/v1/customers/${customerId}`, {
        method: "PUT",
        body: JSON.stringify({ risk_score: missedRate, risk_level }),
      }).catch(() => {});
    },
  },

  installments: {
    list(params?: Record<string, string>): Promise<Installment[]> {
      return request<Installment[]>("/api/v1/installments", {}, params);
    },
    generate(data: GenerateInstallmentsInput): Promise<{ created: number }> {
      return request<{ created: number }>("/api/v1/installments/generate", { method: "POST", body: JSON.stringify(data) });
    },
    markPaid(id: number, amount_paid: number): Promise<Installment> {
      return request<Installment>(`/api/v1/installments/${id}/mark-paid`, {
        method: "POST",
        body: JSON.stringify({ amount_paid, paid_date: new Date().toISOString() }),
      });
    },
    overdueSummary(): Promise<OverdueSummary> {
      return request<OverdueSummary>("/api/v1/installments/overdue-summary");
    },
  },

  analytics: {
    dashboard(): Promise<DashboardStats> {
      return request<DashboardStats>("/api/v1/analytics/dashboard");
    },
    revenueTrend(): Promise<TrendPoint[]> {
      return request<TrendPoint[]>("/api/v1/analytics/revenue-trend");
    },
    repaymentTrend(): Promise<TrendPoint[]> {
      return request<TrendPoint[]>("/api/v1/analytics/repayment-trend");
    },
    riskDist(): Promise<RiskPoint[]> {
      return request<RiskPoint[]>("/api/v1/analytics/risk-distribution");
    },
    regionDist(): Promise<RegionPoint[]> {
      return request<RegionPoint[]>("/api/v1/analytics/region-distribution");
    },
    insights(): Promise<Insight[]> {
      return request<Insight[]>("/api/v1/analytics/insights");
    },
    healthImpact(): Promise<{ total_sessions: number; total_attendees: number; avg_feedback_score: number }> {
      return request("/api/v1/analytics/health-impact");
    },
  },

  predict: {
    batchRisk(): Promise<{ updated: number; high_risk: number; medium_risk: number; low_risk: number; message: string }> {
      return request("/api/v1/predict/batch-risk", { method: "POST" });
    },
    forecast(data: { product_type: string; periods: number }): Promise<{ forecast: { month: string; predicted_demand: number }[] }> {
      return request("/api/v1/predict/forecast", { method: "POST", body: JSON.stringify(data) });
    },
    segments(): Promise<{ segment: string; count: number; desc?: string }[]> {
      return request("/api/v1/predict/segments");
    },
  },

  health: {
    list(): Promise<unknown[]> {
      return request("/api/v1/health-sessions");
    },
    create(data: Record<string, unknown>): Promise<unknown> {
      return request("/api/v1/health-sessions", { method: "POST", body: JSON.stringify(data) });
    },
    delete(id: number): Promise<void> {
      return request<void>(`/api/v1/health-sessions/${id}`, { method: "DELETE" });
    },
  },

  notifications: {
    list(params?: Record<string, string>): Promise<Notification[]> {
      return request<Notification[]>("/api/v1/notifications", {}, params);
    },
    create(data: Partial<Notification>): Promise<Notification> {
      return request<Notification>("/api/v1/notifications", { method: "POST", body: JSON.stringify(data) });
    },
  },

  audit: {
    list(params?: Record<string, string>): Promise<AuditLog[]> {
      return request<AuditLog[]>("/api/v1/audit-logs", {}, params);
    },
  },

  reports: {
    summary(): Promise<Record<string, unknown>> {
      return request("/api/v1/reports/summary");
    },
    donor(): Promise<Record<string, unknown>> {
      return request("/api/v1/reports/donor");
    },
    csvKpi(): Promise<void> {
      return downloadCsv("/api/v1/reports/export/kpi", "kosmo-kpi-summary.csv");
    },
    csvCustomers(): Promise<void> {
      return downloadCsv("/api/v1/reports/export/customers", "kosmo-customers.csv");
    },
    csvPayments(): Promise<void> {
      return downloadCsv("/api/v1/reports/export/payments", "kosmo-payments.csv");
    },
  },
};

export function connectDashboardWS(onMessage: (data: Partial<DashboardStats>) => void): () => void {
  const wsBase = BASE.replace(/^http/, "ws");
  const token = getToken();
  const url = `${wsBase}/api/v1/ws/dashboard${token ? `?token=${token}` : ""}`;
  let ws: WebSocket | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;
  const connect = () => {
    if (stopped) return;
    ws = new WebSocket(url);
    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch { }
    };
    ws.onclose = () => {
      if (!stopped) retryTimer = setTimeout(connect, 5000);
    };
    ws.onerror = () => { ws?.close(); };
  };
  connect();
  return () => {
    stopped = true;
    if (retryTimer) clearTimeout(retryTimer);
    ws?.close();
  };
}