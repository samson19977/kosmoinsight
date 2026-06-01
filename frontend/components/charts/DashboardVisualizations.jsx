import React from "react";
import RwandaRegionMap from "./RwandaRegionMap";
import RepaymentGauge from "./RepaymentGauge";
import CustomerGrowthChart from "./CustomerGrowthChart";

/**
 * DashboardVisualizations
 *
 * Drop this component into your existing dashboard layout.
 * Pass real data from your backend via props.
 *
 * Props:
 *   regionData   – object with keys: Kigali, North, South, East, West
 *                  each: { customers: number, percentage: number }
 *   repaymentRate – number (0–100)
 *   repaymentTarget – number (0–100), default 85
 *   growthData   – array of { month, customers, newCustomers }
 *   grantTarget  – number, reference line on growth chart
 */
export default function DashboardVisualizations({
  regionData,
  repaymentRate = 78,
  repaymentTarget = 85,
  growthData,
  grantTarget = 1000,
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
      {/* Row 1: Map + Gauge side by side */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {/* Map card */}
        <div
          style={{
            background: "var(--color-background-primary)",
            borderRadius: 12,
            border: "0.5px solid var(--color-border-tertiary)",
            padding: "16px 20px",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Customer distribution
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
              By province
            </div>
          </div>
          <RwandaRegionMap data={regionData} />
        </div>

        {/* Gauge card */}
        <div
          style={{
            background: "var(--color-background-primary)",
            borderRadius: 12,
            border: "0.5px solid var(--color-border-tertiary)",
            padding: "16px 20px",
          }}
        >
          <div style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
              Repayment rate
            </div>
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
              vs {repaymentTarget}% target
            </div>
          </div>
          <RepaymentGauge rate={repaymentRate} target={repaymentTarget} />
        </div>
      </div>

      {/* Row 2: Growth chart full width */}
      <div
        style={{
          background: "var(--color-background-primary)",
          borderRadius: 12,
          border: "0.5px solid var(--color-border-tertiary)",
          padding: "16px 20px",
        }}
      >
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)" }}>
            Customer growth
          </div>
          <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginTop: 2 }}>
            Monthly momentum · 2024
          </div>
        </div>
        <CustomerGrowthChart data={growthData} grantTarget={grantTarget} />
      </div>
    </div>
  );
}
