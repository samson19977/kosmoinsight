"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Btn, InsightCard, Card } from "@/components/ui";

interface ForecastPoint { month: string; predicted_demand: number; }
interface Segment { segment: string; count: number; desc?: string; }
interface BatchResult { updated: number; high_risk: number; medium_risk: number; low_risk: number; message: string; }

const SEG_COLORS: Record<string, string> = {
  Champions: "#1D9E75", Loyal: "#378ADD", "At Risk": "#EF9F27",
  "High Risk": "#E24B4A", New: "#7C3AED",
};
const SEG_DESC: Record<string, string> = {
  Champions: "Active, on-time payers — low risk, 6+ months",
  Loyal: "Reliable payers — low risk, 3–6 months",
  "At Risk": "Medium risk — needs proactive engagement",
  "High Risk": "High risk or defaulted — urgent follow-up",
  New: "Joined in last 3 months — still establishing history",
};

export default function AIPage() {
  const [product, setProduct]       = useState("menstrual_health");
  const [forecast, setForecast]     = useState<ForecastPoint[] | null>(null);
  const [segments, setSegments]     = useState<Segment[] | null>(null);
  const [batchResult, setBatchResult] = useState<BatchResult | null>(null);
  const [loading, setLoading]       = useState<string | null>(null);
  const [error, setError]           = useState<string | null>(null);

  const runForecast = async () => {
    setLoading("forecast"); setError(null);
    try {
      const r = await api.predict.forecast({ product_type: product, periods: 3 });
      setForecast((r as { forecast: ForecastPoint[] }).forecast);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Forecast failed. Please try again.");
    } finally { setLoading(null); }
  };

  const runSegments = async () => {
    setLoading("seg"); setError(null);
    try {
      const r = await api.predict.segments();
      setSegments(r as Segment[]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Segmentation failed. Please try again.");
    } finally { setLoading(null); }
  };

  const runBatch = async () => {
    setLoading("batch"); setError(null);
    try {
      const r = await api.predict.batchRisk();
      setBatchResult(r as BatchResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Batch update failed. Please try again.");
    } finally { setLoading(null); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="AI & ML Hub" sub="Demand forecasting, customer segmentation, and batch risk scoring" />

      {error && (
        <div style={{ background: "#FEE2E2", border: "1px solid #FCA5A5", borderRadius: 10, padding: "12px 16px", color: "#991B1B", fontSize: 14 }}>
          ⚠️ {error}
        </div>
      )}

      {/* Batch Risk Refresh */}
      <Card title="🔄 Batch Risk Score Update">
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          Recalculate risk scores for all customers based on their latest payment behaviour. Run this monthly to keep scores fresh.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Btn onClick={runBatch} disabled={loading === "batch"}>
            {loading === "batch" ? "Updating…" : "Run Batch Risk Update"}
          </Btn>
          {loading === "batch" && (
            <span style={{ fontSize: 13, color: "#666" }}>Processing all customers — this may take 10–20 seconds…</span>
          )}
        </div>
        {batchResult && (
          <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
            <div style={{ background: "#ECFDF5", borderRadius: 10, padding: "12px 18px", flex: 1, minWidth: 120, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#065F46", fontWeight: 600 }}>Updated</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: "#065F46" }}>{batchResult.updated}</p>
            </div>
            <div style={{ background: "#FEF2F2", borderRadius: 10, padding: "12px 18px", flex: 1, minWidth: 120, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#991B1B", fontWeight: 600 }}>High Risk</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: "#991B1B" }}>{batchResult.high_risk}</p>
            </div>
            <div style={{ background: "#FFFBEB", borderRadius: 10, padding: "12px 18px", flex: 1, minWidth: 120, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#92400E", fontWeight: 600 }}>Medium Risk</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: "#92400E" }}>{batchResult.medium_risk}</p>
            </div>
            <div style={{ background: "#ECFDF5", borderRadius: 10, padding: "12px 18px", flex: 1, minWidth: 120, textAlign: "center" }}>
              <p style={{ fontSize: 11, color: "#065F46", fontWeight: 600 }}>Low Risk</p>
              <p style={{ fontSize: 28, fontWeight: 700, color: "#065F46" }}>{batchResult.low_risk}</p>
            </div>
          </div>
        )}
        {batchResult && (
          <div style={{ marginTop: 12 }}>
            <InsightCard type="success" message={batchResult.message} />
          </div>
        )}
      </Card>

      {/* Demand Forecast */}
      <Card title="📈 Demand Forecasting">
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          Predict product demand for the next 3 months based on distribution trends.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={product} onChange={e => setProduct(e.target.value)}
            style={{ border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 14px", fontSize: 14, background: "#fff", cursor: "pointer" }}>
            <option value="menstrual_health">Menstrual Health Products</option>
            <option value="maternal_health">Maternal Health Kit</option>
            <option value="solar">Solar Lamps</option>
            <option value="energy">Clean Cookstoves</option>
          </select>
          <Btn onClick={runForecast} disabled={loading === "forecast"}>
            {loading === "forecast" ? "Running…" : "Run Forecast"}
          </Btn>
        </div>
        {forecast && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {forecast.map(f => (
                <div key={f.month} style={{ flex: 1, minWidth: 120, background: "#EEEDFE", borderRadius: 12, padding: "16px 18px", textAlign: "center" }}>
                  <p style={{ fontSize: 11, color: "#534AB7", fontWeight: 600, marginBottom: 6 }}>{f.month}</p>
                  <p style={{ fontSize: 32, fontWeight: 700, color: "#3C3489", marginBottom: 4 }}>{f.predicted_demand}</p>
                  <p style={{ fontSize: 11, color: "#534AB7" }}>units predicted</p>
                </div>
              ))}
            </div>
            <InsightCard type="success" message={`${product.replace(/_/g, " ")} demand is trending upward. Ensure stock is prepared ahead of time.`} />
          </div>
        )}
      </Card>

      {/* Customer Segmentation */}
      <Card title="🎯 Customer Segmentation">
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>
          Cluster customers by risk level and engagement into actionable segments.
        </p>
        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
          <Btn onClick={runSegments} disabled={loading === "seg"}>
            {loading === "seg" ? "Analyzing…" : "Run Segmentation"}
          </Btn>
          {loading === "seg" && (
            <span style={{ fontSize: 13, color: "#666" }}>Analyzing all customers…</span>
          )}
        </div>
        {segments && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {segments.filter(s => s.count > 0).map(s => {
                const color = SEG_COLORS[s.segment] || "#888";
                return (
                  <div key={s.segment} style={{ flex: 1, minWidth: 140, border: `2px solid ${color}25`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "14px 16px" }}>
                    <p style={{ fontSize: 12, color, fontWeight: 600, marginBottom: 4 }}>{s.segment}</p>
                    <p style={{ fontSize: 28, fontWeight: 700, color: "#1a1a1a", marginBottom: 6 }}>{s.count}</p>
                    <p style={{ fontSize: 12, color: "#888" }}>{SEG_DESC[s.segment] || ""}</p>
                  </div>
                );
              })}
            </div>
            <InsightCard type="info" message="Review 'At Risk' and 'High Risk' segments — targeted outreach can improve repayment rates and retention." />
          </div>
        )}
      </Card>

      {/* AI Tips */}
      <Card title="💡 AI Recommendations">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <InsightCard type="info"    message="Run the batch risk update at the start of each month to keep AI scores current." />
          <InsightCard type="warning" message="Customers with >50% missed payments should be contacted within 48 hours." />
          <InsightCard type="success" message="Customers in the 'Champions' segment can be offered loyalty upgrades or new product lines." />
          <InsightCard type="info"    message="Use demand forecasts to plan procurement 6–8 weeks in advance to avoid stockouts." />
        </div>
      </Card>
    </div>
  );
}
