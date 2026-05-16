"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Btn, Card, InsightCard } from "@/components/ui";

export default function ReportsPage() {
  const [summary, setSummary] = useState<Record<string, unknown> | null>(null);
  const [donor, setDonor] = useState<Record<string, unknown> | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const loadSummary = async () => { setLoading("summary"); setSummary(await api.reports.summary() as Record<string, unknown>); setLoading(null); };
  const loadDonor = async () => { setLoading("donor"); setDonor(await api.reports.donor() as Record<string, unknown>); setLoading(null); };

  const downloadJSON = (data: unknown, name: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${name}-${new Date().toISOString().split("T")[0]}.json`;
    a.click();
  };

  const kpis = summary ? (summary.kpis as Record<string, unknown>) : null;
  const impact = donor ? (donor.impact_metrics as Record<string, unknown>) : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Reports" sub="Generate KPI, donor, and investor reports" />

      {/* KPI Summary */}
      <Card title="📊 KPI Summary Report" action={<Btn small onClick={() => summary && downloadJSON(summary, "kpi-report")}>⬇ Download JSON</Btn>}>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>Internal management report with all key performance indicators.</p>
        <Btn onClick={loadSummary}>{loading === "summary" ? "Generating..." : "Generate KPI Report"}</Btn>
        {summary && kpis && (
          <div style={{ marginTop: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: 12, marginBottom: 16 }}>
              {Object.entries(kpis).map(([k, v]) => (
                <div key={k} style={{ background: "#FAFAF8", borderRadius: 10, padding: "14px 16px" }}>
                  <p style={{ fontSize: 11, color: "#888", fontWeight: 500, marginBottom: 4 }}>{k.replace(/_/g, " ").toUpperCase()}</p>
                  <p style={{ fontSize: 20, fontWeight: 700, color: "#1a1a1a" }}>{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
                </div>
              ))}
            </div>
            <InsightCard type="success" message={`Report generated at ${new Date(summary.generated_at as string).toLocaleString()}`} />
          </div>
        )}
      </Card>

      {/* Donor Report */}
      <Card title="❤ Donor Impact Report" action={<Btn small onClick={() => donor && downloadJSON(donor, "donor-report")}>⬇ Download JSON</Btn>}>
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>Impact-focused report for donors and grant applications.</p>
        <Btn onClick={loadDonor}>{loading === "donor" ? "Generating..." : "Generate Donor Report"}</Btn>
        {donor && impact && (
          <div style={{ marginTop: 16 }}>
            <div style={{ background: "#EEEDFE", borderRadius: 12, padding: "20px 24px", marginBottom: 14 }}>
              <h3 style={{ fontSize: 16, fontWeight: 700, color: "#3C3489", marginBottom: 6 }}>{String(donor.title)}</h3>
              <p style={{ fontSize: 13, color: "#534AB7", lineHeight: 1.6 }}>{String(donor.narrative)}</p>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 14 }}>
              {Object.entries(impact).map(([k, v]) => (
                <div key={k} style={{ background: "#E1F5EE", borderRadius: 10, padding: "14px 16px", textAlign: "center" }}>
                  <p style={{ fontSize: 28, fontWeight: 700, color: "#085041", marginBottom: 4 }}>{typeof v === "number" ? v.toLocaleString() : String(v)}</p>
                  <p style={{ fontSize: 11, color: "#0F6E56", fontWeight: 500 }}>{k.replace(/_/g, " ")}</p>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      <Card title="📝 How to Export Reports">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <InsightCard type="info" message="Click 'Download JSON' to export any report as a JSON file you can share or import into Excel / Google Sheets." />
          <InsightCard type="info" message="For PDF exports, paste the downloaded JSON into a Google Docs template or use the json-to-pdf tool of your choice." />
          <InsightCard type="success" message="Donor reports are designed to highlight community impact metrics for grant applications and investor presentations." />
        </div>
      </Card>
    </div>
  );
}
