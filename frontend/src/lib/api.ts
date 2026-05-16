// Central API client — all fetch calls go through here

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("kosmo_token");
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (res.status === 401) {
    localStorage.removeItem("kosmo_token");
    localStorage.removeItem("kosmo_user");
    window.location.href = "/login";
    throw new Error("Unauthorized");
  }

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new Error(err.detail || "Request failed");
  }

  if (res.status === 204) return undefined as T;
  return res.json();
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
export const api = {
  auth: {
    login: (email: string, password: string) => {
      const form = new URLSearchParams();
      form.append("username", email);
      form.append("password", password);
      return fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: form,
      }).then((r) => r.json());
    },
    register: (data: { name: string; email: string; password: string; role: string }) =>
      request("/api/auth/register", { method: "POST", body: JSON.stringify(data) }),
    me: () => request("/api/auth/me"),
  },

  customers: {
    list: (params?: { search?: string; region?: string; status?: string; risk_level?: string }) => {
      const q = new URLSearchParams(params as Record<string, string>).toString();
      return request(`/api/customers${q ? "?" + q : ""}`);
    },
    get: (id: number) => request(`/api/customers/${id}`),
    create: (data: unknown) => request("/api/customers", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: unknown) =>
      request(`/api/customers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
    delete: (id: number) => request(`/api/customers/${id}`, { method: "DELETE" }),
    payments: (id: number) => request(`/api/customers/${id}/payments`),
  },

  payments: {
    list: () => request("/api/payments"),
    create: (data: unknown) => request("/api/payments", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: unknown) =>
      request(`/api/payments/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  },

  analytics: {
    dashboard: () => request<DashboardStats>("/api/analytics/dashboard"),
    revenueTrend: () => request("/api/analytics/revenue-trend"),
    repaymentTrend: () => request("/api/analytics/repayment-trend"),
    riskDistribution: () => request("/api/analytics/risk-distribution"),
    regionDistribution: () => request("/api/analytics/region-distribution"),
    healthImpact: () => request("/api/analytics/health-impact"),
    aiInsights: () => request<AiInsight[]>("/api/analytics/ai-insights"),
  },

  predictions: {
    repaymentRisk: (data: unknown) =>
      request("/api/predict/repayment-risk", { method: "POST", body: JSON.stringify(data) }),
    batchRisk: () => request("/api/predict/batch-risk-update", { method: "POST" }),
    demandForecast: (data: unknown) =>
      request("/api/predict/demand-forecast", { method: "POST", body: JSON.stringify(data) }),
    segmentation: () => request("/api/predict/segmentation"),
  },

  reports: {
    summary: () => request("/api/reports/summary"),
    donor: () => request("/api/reports/donor"),
  },
};

export interface DashboardStats {
  total_customers: number;
  active_customers: number;
  total_revenue: number;
  repayment_rate: number;
  high_risk_count: number;
  products_distributed: number;
  health_sessions_count: number;
  this_month_revenue: number;
  revenue_change_pct: number;
}

export interface AiInsight {
  type: "warning" | "info" | "success";
  message: string;
}

export interface Customer {
  id: number;
  name: string;
  phone: string;
  location?: string;
  region?: string;
  product_type?: string;
  payment_plan?: string;
  status: string;
  risk_score: number;
  risk_level: string;
  join_date: string;
}
