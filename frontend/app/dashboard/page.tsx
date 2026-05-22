"use client";
import { useEffect, useState } from "react";
import { api, DashboardStats, TrendPoint, RiskPoint, RegionPoint, Insight } from "@/lib/api";
import { KpiCard, InsightCard, Card, Loading } from "@/components/ui";
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";

const COLORS = { low: "#1D9E75", medium: "#EF9F27", high: "#E24B4A" };

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

      {/* Charts row 1 */}
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
              <Pie data={risk} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({ percent }) => `${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false}>
                {risk.map((e, i) => <Cell key={i} fill={Object.values(COLORS)[i % 3]} />)}
              </Pie>
              <Tooltip />
              <Legend iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
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
          <h3 style={{ fontSize: 15, fontWeight: 600, marginBottom: 16, color: "#1a1a1a" }}>Customers by Region</h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={regions} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#F0EDE6" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 11, fill: "#888" }} />
              <YAxis type="category" dataKey="region" tick={{ fontSize: 11, fill: "#444" }} width={65} />
              <Tooltip />
              <Bar dataKey="count" fill="#378ADD" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
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

