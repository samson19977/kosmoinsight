"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Btn, InsightCard, Card, KpiCard } from "@/components/ui";

interface ForecastPoint { month: string; predicted_demand: number; }
interface Segment { segment: string; count: number; desc?: string; }

const SEG_COLORS: Record<string, string> = { Champions: "#1D9E75", "At Risk": "#EF9F27", Lost: "#E24B4A", New: "#378ADD" };
const SEG_DESC: Record<string, string> = { Champions: "Active, on-time payers, low risk", "At Risk": "Medium risk, needs engagement", Lost: "High risk or defaulted", New: "Joined in last 3 months" };

export default function AIPage() {
  const [product, setProduct] = useState("menstrual_health");
  const [forecast, setForecast] = useState<ForecastPoint[] | null>(null);
  const [segments, setSegments] = useState<Segment[] | null>(null);
  const [batchResult, setBatchResult] = useState<{ updated: number } | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  const runForecast = async () => {
    setLoading("forecast");
    const r = await api.predict.forecast({ product_type: product, periods: 3 });
    setForecast((r as { forecast: ForecastPoint[] }).forecast);
    setLoading(null);
  };

  const runSegments = async () => {
    setLoading("seg");
    const r = await api.predict.segments();
    setSegments(r as Segment[]);
    setLoading(null);
  };

  const runBatch = async () => {
    setLoading("batch");
    const r = await api.predict.batchRisk();
    setBatchResult(r as { updated: number });
    setLoading(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="AI & ML Hub" sub="Demand forecasting, customer segmentation, and batch risk scoring" />

      {/* Batch Risk Refresh */}
      <Card title="🔄 Batch Risk Score Update">
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>Recalculate risk scores for all customers based on their latest payment behaviour. Run this monthly to keep scores fresh.</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
          <Btn onClick={runBatch}>{loading === "batch" ? "Updating..." : "Run Batch Risk Update"}</Btn>
          {batchResult && <InsightCard type="success" message={`Risk scores updated for ${batchResult.updated} customers successfully.`} />}
        </div>
      </Card>

      {/* Demand Forecast */}
      <Card title="📈 Demand Forecasting">
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>Predict product demand for the next 3 months based on distribution trends.</p>
        <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 16, flexWrap: "wrap" }}>
          <select value={product} onChange={e => setProduct(e.target.value)}
            style={{ border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 14px", fontSize: 14, background: "#fff", cursor: "pointer" }}>
            <option value="menstrual_health">Menstrual Health Products</option>
            <option value="maternal_health">Maternal Health Kit</option>
            <option value="solar">Solar Lamps</option>
            <option value="energy">Clean Cookstoves</option>
          </select>
          <Btn onClick={runForecast}>{loading === "forecast" ? "Running..." : "Run Forecast"}</Btn>
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
        <p style={{ fontSize: 14, color: "#666", marginBottom: 16 }}>Cluster customers by risk level and engagement into actionable segments.</p>
        <Btn onClick={runSegments}>{loading === "seg" ? "Analyzing..." : "Run Segmentation"}</Btn>
        {segments && (
          <div style={{ marginTop: 16, display: "flex", flexDirection: "column", gap: 12 }}>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {segments.map(s => {
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
            <InsightCard type="info" message="Review 'At Risk' and 'Lost' segments — targeted outreach can improve repayment rates and retention." />
          </div>
        )}
      </Card>

      {/* AI Tips */}
      <Card title="💡 AI Recommendations">
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <InsightCard type="info" message="Run the batch risk update at the start of each month to keep AI scores current." />
          <InsightCard type="warning" message="Customers with >50% missed payments should be contacted within 48 hours." />
          <InsightCard type="success" message="Customers in the 'Champions' segment can be offered loyalty upgrades or new product lines." />
          <InsightCard type="info" message="Use demand forecasts to plan procurement 6–8 weeks in advance to avoid stockouts." />
        </div>
      </Card>
    </div>
  );
}
