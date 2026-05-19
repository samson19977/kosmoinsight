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
  if (res.status === 401) { localStorage.clear(); window.location.href = "/login"; throw new Error("Unauthorized"); }
  if (res.status === 403) { throw new Error("⛔ Access denied. You don't have permission for this action."); }
  if (!res.ok) { const e = await res.json().catch(() => ({ detail: "Error" })); throw new Error(e.detail || "Request failed"); }
  if (res.status === 204) return undefined as T;
  return res.json();
}

// Direct CSV download — opens in Excel, no conversion needed
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

// Wake up Render backend (fixes slow first login)
export function pingBackend() {
  fetch(`${API}/api/health`).catch(() => {});
}

export const api = {
  customers: {
    list: (params?: Record<string, string>) => {
      const merged = { limit: "1000", ...params };
      return req<Customer[]>(`/api/customers?${new URLSearchParams(merged)}`);
    },
    get: (id: number) => req<Customer>(`/api/customers/${id}`),
    create: (d: Partial<Customer>) => req<Customer>("/api/customers", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: Partial<Customer>) => req<Customer>(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    delete: (id: number) => req(`/api/customers/${id}`, { method: "DELETE" }),
    payments: (id: number) => req(`/api/customers/${id}/payments`),
  },
  payments: {
    list: (params?: Record<string, string>) => {
      const merged = { limit: "2000", ...params };
      return req<Payment[]>(`/api/payments?${new URLSearchParams(merged)}`);
    },
    create: (d: unknown) => req<Payment>("/api/payments", { method: "POST", body: JSON.stringify(d) }),
    update: (id: number, d: unknown) => req<Payment>(`/api/payments/${id}`, { method: "PATCH", body: JSON.stringify(d) }),
    // Auto-recalculate risk after every payment change
    autoRisk: (customerId: number, payments: Payment[]) => {
      const missed = payments.filter(p => p.status === "missed").length;
      return req("/api/predict/repayment-risk", {
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
  analytics: {
    dashboard: () => req<DashboardStats>("/api/analytics/dashboard"),
    revenueTrend: () => req<TrendPoint[]>("/api/analytics/revenue-trend"),
    repaymentTrend: () => req<TrendPoint[]>("/api/analytics/repayment-trend"),
    riskDist: () => req<RiskPoint[]>("/api/analytics/risk-distribution"),
    regionDist: () => req<RegionPoint[]>("/api/analytics/region-distribution"),
    healthImpact: () => req("/api/analytics/health-impact"),
    insights: () => req<Insight[]>("/api/analytics/ai-insights"),
  },
  predict: {
    batchRisk: () => req("/api/predict/batch-risk-update", { method: "POST" }),
    forecast: (d: unknown) => req("/api/predict/demand-forecast", { method: "POST", body: JSON.stringify(d) }),
    segments: () => req("/api/predict/segmentation"),
  },
  reports: {
    summary: () => req("/api/reports/summary"),
    donor: () => req("/api/reports/donor"),
    csvKpi: () => downloadCSV("/api/reports/summary/csv", `kpi-${new Date().toISOString().slice(0,10)}.csv`),
    csvCustomers: () => downloadCSV("/api/reports/customers/csv", `customers-${new Date().toISOString().slice(0,10)}.csv`),
    csvPayments: () => downloadCSV("/api/reports/payments/csv", `payments-${new Date().toISOString().slice(0,10)}.csv`),
  },
  health: {
    list: () => req("/api/health-sessions"),
    create: (d: unknown) => req("/api/health-sessions", { method: "POST", body: JSON.stringify(d) }),
    delete: (id: number) => req(`/api/health-sessions/${id}`, { method: "DELETE" }),
  },
  products: {
    list: () => req("/api/products"),
    distributions: () => req("/api/products/distributions"),
    addDistribution: (d: unknown) => req("/api/products/distributions", { method: "POST", body: JSON.stringify(d) }),
  },
};

export interface Customer { id: number; name: string; phone: string; location?: string; region?: string; product_type?: string; payment_plan?: string; status: string; risk_score: number; risk_level: string; join_date: string; }
export interface Payment { id: number; customer_id: number; amount_due: number; amount_paid: number; remaining_balance?: number; due_date?: string; paid_date?: string; status: string; installment_number?: number; }
export interface DashboardStats { total_customers: number; active_customers: number; total_revenue: number; repayment_rate: number; high_risk_count: number; products_distributed: number; health_sessions_count: number; this_month_revenue: number; revenue_change_pct: number; }
export interface TrendPoint { month: string; revenue?: number; rate?: number; }
export interface RiskPoint { name: string; value: number; }
export interface RegionPoint { region: string; count: number; }
export interface Insight { type: "warning" | "info" | "success"; message: string; }
