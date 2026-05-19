"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Card, InsightCard } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";

export default function ReportsPage() {
  const { user } = useAuth();
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [donor, setDonor] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");

  const btn = (color: string, bg: string) => ({
    background: color, color: "#fff", border: "none", borderRadius: 8,
    padding: "11px 20px", fontSize: 14, fontWeight: 600 as const,
    cursor: "pointer" as const, display: "flex", alignItems: "center" as const, gap: 8,
  });

  const kpiLabels: Record<string, string> = {
    total_customers: "Total Customers", active_customers: "Active Customers",
    high_risk_customers: "High Risk Customers", medium_risk_customers: "Medium Risk Customers",
    low_risk_customers: "Low Risk Customers", total_revenue_rwf: "Total Revenue (RWF)",
    collection_rate_pct: "Collection Rate (%)", missed_payment_rate_pct: "Missed Payment Rate (%)",
    products_distributed: "Products Distributed", health_sessions: "Health Sessions",
  };

  const kpis = summary ? (summary.kpis as Record<string, unknown>) : null;
  const impact = donor ? (donor.impact_metrics as Record<string, unknown>) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Reports & Exports" sub="Download data in CSV format — opens directly in Microsoft Excel" />

      {error && <div style={{ background: "#FCEBEB", border: "1px solid #E24B4A", borderRadius: 10, padding: "12px 16px", color: "#A32D2D", fontSize: 13 }}>{error}</div>}

      {/* ── CSV Downloads ── */}
      <Card title="⬇ Download to Excel (CSV)">
        <p style={{ fontSize: 14, color: "#555", marginBottom: 16, lineHeight: 1.6 }}>
          Click any button to download data as a <strong>CSV file</strong> that opens directly in <strong>Microsoft Excel</strong> or Google Sheets.
          No JSON, no conversion — just click and open.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
          <button style={btn("#7F77DD", "#EEEDFE")} onClick={() => api.reports.csvKpi()}>
            📊 KPI Summary → Excel
          </button>
          <button style={btn("#1D9E75", "#E1F5EE")} onClick={() => api.reports.csvCustomers()}>
            👩 All Customers → Excel
          </button>
          <button style={btn("#185FA5", "#E6F1FB")} onClick={() => api.reports.csvPayments()}>
            💳 All Payments → Excel
          </button>
        </div>
        <div style={{ background: "#E1F5EE", borderRadius: 8, padding: "10px 14px" }}>
          <p style={{ fontSize: 13, color: "#0F6E56", margin: 0 }}>
            ✓ File downloads instantly. Open in Excel → File → Save As → choose .xlsx to share.
          </p>
        </div>
      </Card>

      {/* ── KPI Summary ── */}
      <Card title="📊 KPI Summary (View on screen)">
        <p style={{ fontSize: 14, color: "#666", marginBottom: 14 }}>View all metrics on screen. Use the CSV download above to save to Excel.</p>
        <button onClick={async () => {
          setLoading("summary"); setError("");
          try { setSummary(await api.reports.summary() as Record<string, unknown>); }
          catch (e) { setError(e instanceof Error ? e.message : "Error"); }
          finally { setLoading(null); }
        }} style={{ background: "#7F77DD", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          {loading === "summary" ? "Loading..." : "Show KPI Report"}
        </button>
        {summary && kpis && (
          <div style={{ marginTop: 16, display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: 12 }}>
            {Object.entries(kpis).map(([k, v]) => (
              <div key={k} style={{ background: "#FAFAF8", borderRadius: 10, padding: "14px 16px", borderTop: "3px solid #7F77DD" }}>
                <p style={{ fontSize: 11, color: "#888", fontWeight: 500, marginBottom: 4 }}>{kpiLabels[k] || k}</p>
                <p style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a" }}>{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ── Donor Report ── */}
      <Card title="❤ Donor Impact Report">
        <p style={{ fontSize: 14, color: "#666", marginBottom: 14 }}>Impact metrics for donors, grant applications, and investors.</p>
        <button onClick={async () => {
          setLoading("donor"); setError("");
          try { setDonor(await api.reports.donor() as Record<string, unknown>); }
          catch (e) { setError(e instanceof Error ? e.message : "Error"); }
          finally { setLoading(null); }
        }} style={{ background: "#1D9E75", color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
          {loading === "donor" ? "Loading..." : "Show Donor Report"}
        </button>
        {donor && impact && (
          <div style={{ marginTop: 16 }}>
            <div style={{ background: "#EEEDFE", borderRadius: 10, padding: "16px 20px", marginBottom: 14 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: "#3C3489", marginBottom: 6 }}>{String(donor.title)}</h3>
              <p style={{ fontSize: 13, color: "#534AB7", lineHeight: 1.6 }}>{String(donor.narrative)}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(170px, 1fr))", gap: 12 }}>
              {Object.entries(impact).map(([k, v]) => (
                <div key={k} style={{ background: "#E1F5EE", borderRadius: 10, padding: "14px", textAlign: "center" }}>
                  <p style={{ fontSize: 28, fontWeight: 700, color: "#085041", marginBottom: 4 }}>{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
                  <p style={{ fontSize: 11, color: "#0F6E56", fontWeight: 500 }}>{k.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* ── Role Info ── */}
      <Card title="🔐 Your Access Level">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {[
            { role: "admin", label: "Admin", color: "#7F77DD", desc: "God mode — add, edit, delete everything. Manage users." },
            { role: "staff", label: "Staff", color: "#1D9E75", desc: "Worker mode — add customers & payments. Cannot delete records." },
            { role: "analyst", label: "Analyst", color: "#185FA5", desc: "Viewer mode — see reports and charts. Cannot add or delete." },
          ].map(({ role, label, color, desc }) => (
            <div key={role} style={{ background: user?.role === role ? `${color}15` : "#FAFAF8", border: `1px solid ${user?.role === role ? color : "#E8E6E0"}`, borderRadius: 8, padding: "12px 16px", display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{ background: color, color: "#fff", borderRadius: 6, padding: "3px 10px", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>{label}</span>
              <span style={{ fontSize: 13, color: "#333", flex: 1 }}>{desc}</span>
              {user?.role === role && <span style={{ fontSize: 12, color, fontWeight: 700 }}>← You are here</span>}
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
