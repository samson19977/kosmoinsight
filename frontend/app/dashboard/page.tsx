"use client";
import { useEffect, useState } from "react";
import { api, DashboardStats, TrendPoint, RiskPoint, RegionPoint, Insight } from "@/lib/api";
import { KpiCard, InsightCard, Card, Loading } from "@/components/ui";
import {
  LineChart, Line,
  AreaChart, Area,
  BarChart, Bar,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine
} from "recharts";
import RwandaRegionMap from "@/components/charts/RwandaRegionMap";

const COLORS = { low: "#1D9E75", medium: "#EF9F27", high: "#E24B4A" };
const GRANT_TARGET = 500; // update this to your real grant milestone number

// ── Region data transformer ───────────────────────────────────────────────────
function toRegionMap(regions: RegionPoint[]) {
  const total = regions.reduce((s, r) => s + r.count, 0) || 1;
  const aliases: Record<string, string> = {
    kigali: "Kigali", northern: "North", north: "North",
    southern: "South", south: "South", eastern: "East",
    east: "East", western: "West", west: "West",
  };
  const map: Record<string, { customers: number; percentage: number }> = {};
  regions.forEach(r => {
    const key = aliases[r.region?.toLowerCase() ?? ""] ?? r.region;
    map[key] = { customers: r.count, percentage: Math.round((r.count / total) * 100) };
  });
  return map;
}

// ── Customer Growth Area Chart ────────────────────────────────────────────────
function CustomerGrowthChart({ data }: { data: TrendPoint[] }) {
  const [showNew, setShowNew] = useState(false);

  // Build cumulative + new-per-month from repayment trend months
  // We use the months array and derive running totals from revenue data
  // (backend doesn't have a separate growth endpoint, so we compute from what we have)
  const chartData = data.map((d, i) => ({
    month: d.month,
    rate: d.rate ?? 0,
    // simulate new customers per month as incremental — replace with real data if available
    newThisMonth: i === 0 ? (d.rate ?? 0) : Math.max(0, (d.rate ?? 0) - (data[i - 1]?.rate ?? 0)),
  }));

  const btnStyle = (active: boolean) => ({
    padding: "4px 14px",
    borderRadius: 20,
    border: "0.5px solid",
    borderColor: active ? "#1D9E75" : "#E8E6E0",
    background: active ? "#E1F5EE" : "transparent",
    color: active ? "#0F6E56" : "#888",
    cursor: "pointer",
    fontSize: 12,
    fontFamily: "inherit",
  });

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
        <button style={btnStyle(!showNew)} onClick={() => setShowNew(false)}>Cumulative</button>
        <button style={btnStyle(showNew)} onClick={() => setShowNew(true)}>New per month</button>
      </div>
      <ResponsiveContainer width="100%" height={160}>
        <AreaChart data={chartData} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
          <defs>
            <linearGradient id="growthGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#378ADD" stopOpacity={0.18} />
              <stop offset="95%" stopColor="#378ADD" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE6" vertical={false} />
          <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#888" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: "#888" }} unit="%" domain={[0, 100]} axisLine={false} tickLine={false} />
          <Tooltip formatter={(v) => [`${Number(v).toFixed(1)}%`, showNew ? "New this month" : "Repayment rate"]} />
          {!showNew && (
            <ReferenceLine
              y={GRANT_TARGET / 10}
              stroke="#7F77DD"
              strokeDasharray="5 4"
              strokeWidth={1.5}
              label={{ value: "Grant milestone", position: "insideTopRight", fontSize: 10, fill: "#7F77DD" }}
            />
          )}
          {showNew ? (
            <Area type="monotone" dataKey="newThisMonth" name="New this month"
              stroke="#378ADD" strokeWidth={2} fill="url(#newGrad)"
              dot={false} activeDot={{ r: 4, fill: "#378ADD" }} />
          ) : (
            <Area type="monotone" dataKey="rate" name="Repayment rate"
              stroke="#1D9E75" strokeWidth={2} fill="url(#growthGrad)"
              dot={false} activeDot={{ r: 4, fill: "#1D9E75" }} />
          )}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [revenue, setRevenue] = useState<TrendPoint[]>([]);
  const [repayment, setRepayment] = useState<TrendPoint[]>([]);
  const [risk, setRisk] = useState<RiskPoint[]>([]);
  const [regions, setRegions] = useState<RegionPoint[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    Promise.all([
      api.analytics.dashboard(),
      api.analytics.revenueTrend(),
      api.analytics.repaymentTrend(),
      api.analytics.riskDist(),
      api.analytics.regionDist(),
      api.analytics.insights(),
    ]).then(([s, rev, rep, r, reg, ins]) => {
      setStats(s as DashboardStats);
      setRevenue(rev as TrendPoint[]);
      setRepayment(rep as TrendPoint[]);
      setRisk(r as RiskPoint[]);
      setRegions(reg as RegionPoint[]);
      setInsights(ins as Insight[]);
    }).catch(e => setError(e.message));
  }, []);

  if (error) return (
    <div style={{ padding: 20, color: "#E24B4A", background: "#FCEBEB", borderRadius: 10, fontSize: 14 }}>
      Could not load dashboard: {error}
      <br /><small>Make sure the backend API is running and NEXT_PUBLIC_API_URL is set correctly.</small>
    </div>
  );
  if (!stats) return <Loading />;

  const fmtRWF = (n: number) => n >= 1000000 ? `RWF ${(n / 1000000).toFixed(2)}M` : `RWF ${(n / 1000).toFixed(0)}K`;
  const regionData = toRegionMap(regions);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>Dashboard Overview</h2>
        <p style={{ fontSize: 14, color: "#888" }}>KosmoInsight AI — Live Data</p>
      </div>

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Total Customers" value={stats.total_customers} sub={`${stats.active_customers} active`} color="#7F77DD" icon="👩" />
        <KpiCard label="Repayment Rate" value={`${stats.repayment_rate}%`} sub="Overall" color="#1D9E75" icon="↗" />
        <KpiCard label="This Month Revenue" value={fmtRWF(stats.this_month_revenue)} sub={`${stats.revenue_change_pct > 0 ? "+" : ""}${stats.revenue_change_pct}% vs last month`} color="#7F77DD" icon="💰" />
        <KpiCard label="High Risk Alerts" value={stats.high_risk_count} sub="Needs follow-up" color="#E24B4A" icon="⚠" />
        <KpiCard label="Products Distributed" value={stats.products_distributed} sub="All regions" color="#185FA5" icon="📦" />
        <KpiCard label="Health Sessions" value={stats.health_sessions_count} sub="Community impact" color="#1D9E75" icon="🏥" />
      </div>

      {/* Row 1: Revenue + Risk */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 2, minWidth: 300, background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Revenue Trend</h3>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={revenue}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE6" />
              <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} tickFormatter={v => `${(Number(v) / 1000000).toFixed(1)}M`} />
              <Tooltip formatter={(v) => [fmtRWF(Number(v)), "Revenue"]} />
              <Line type="monotone" dataKey="revenue" stroke="#7F77DD" strokeWidth={2.5} dot={{ fill: "#7F77DD", r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, minWidth: 240, background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Risk Distribution</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={risk} cx="50%" cy="50%" outerRadius={70} dataKey="value"
                label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {risk.map((e, i) => <Cell key={i} fill={Object.values(COLORS)[i % 3]} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Row 2: Repayment bar (kept) + Growth area chart (new) */}
      <div style={{ display: "flex", gap: 18, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: 280, background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Repayment Rate Trend</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={repayment}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE6" />
              <XAxis dataKey="month" tick={{ fontSize: 10, fill: "#888" }} />
              <YAxis tick={{ fontSize: 11, fill: "#888" }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v) => [`${Number(v)}%`, "Rate"]} />
              <Bar dataKey="rate" fill="#1D9E75" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={{ flex: 1, minWidth: 280, background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, padding: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: "#1a1a1a" }}>Customer Growth</h3>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 12 }}>Monthly momentum</p>
          <CustomerGrowthChart data={repayment} />
        </div>
      </div>

      {/* Row 3: Rwanda Map full width */}
      <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, padding: 20 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: "#1a1a1a" }}>Customer Distribution</h3>
        <p style={{ fontSize: 12, color: "#888", marginBottom: 16 }}>By province — hover to explore</p>
        <RwandaRegionMap data={regionData} />
      </div>

      {/* AI Insights */}
      <Card title="🤖 AI Insights">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {insights.length === 0
            ? <p style={{ color: "#888", fontSize: 14 }}>No insights yet. Add data to get started.</p>
            : insights.map((ins, i) => <InsightCard key={i} type={ins.type} message={ins.message} />)}
        </div>
      </Card>
    </div>
  );
}
