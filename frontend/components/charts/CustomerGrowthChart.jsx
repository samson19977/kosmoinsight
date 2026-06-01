import React, { useState } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";

// Sample data — replace with real data from your API/backend
const DEFAULT_DATA = [
  { month: "Jan", customers: 210, newCustomers: 38 },
  { month: "Feb", customers: 265, newCustomers: 55 },
  { month: "Mar", customers: 340, newCustomers: 75 },
  { month: "Apr", customers: 420, newCustomers: 80 },
  { month: "May", customers: 510, newCustomers: 90 },
  { month: "Jun", customers: 630, newCustomers: 120 },
  { month: "Jul", customers: 780, newCustomers: 150 },
  { month: "Aug", customers: 920, newCustomers: 140 },
  { month: "Sep", customers: 1080, newCustomers: 160 },
  { month: "Oct", customers: 1230, newCustomers: 150 },
  { month: "Nov", customers: 1370, newCustomers: 140 },
  { month: "Dec", customers: 1520, newCustomers: 150 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "var(--color-background-primary, #fff)",
        border: "0.5px solid var(--color-border-secondary, rgba(0,0,0,0.2))",
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
      }}
    >
      <div style={{ fontWeight: 500, marginBottom: 4, color: "var(--color-text-primary, #2C2C2A)" }}>
        {label}
      </div>
      {payload.map((p) => (
        <div key={p.dataKey} style={{ color: p.color, display: "flex", gap: 8 }}>
          <span>{p.name}</span>
          <span style={{ fontWeight: 500 }}>{p.value.toLocaleString()}</span>
        </div>
      ))}
    </div>
  );
};

export default function CustomerGrowthChart({ data = DEFAULT_DATA, grantTarget = 1000 }) {
  const [showNew, setShowNew] = useState(false);

  const totalGrowth = data[data.length - 1].customers - data[0].customers;
  const growthPct = Math.round((totalGrowth / data[0].customers) * 100);

  return (
    <div style={{ width: "100%", fontFamily: "inherit" }}>
      {/* Mini metric row */}
      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
        {[
          {
            label: "Total customers",
            value: data[data.length - 1].customers.toLocaleString(),
            sub: `+${growthPct}% this year`,
            color: "#1D9E75",
          },
          {
            label: "Avg. monthly growth",
            value: Math.round(totalGrowth / (data.length - 1)).toLocaleString(),
            sub: "new customers / month",
            color: "#378ADD",
          },
          {
            label: "Grant milestone",
            value: `${Math.round((data[data.length - 1].customers / grantTarget) * 100)}%`,
            sub: `of ${grantTarget.toLocaleString()} target`,
            color: "#7F77DD",
          },
        ].map((m) => (
          <div
            key={m.label}
            style={{
              flex: "1 1 120px",
              background: "var(--color-background-secondary, #f5f3ec)",
              borderRadius: 8,
              padding: "10px 14px",
            }}
          >
            <div style={{ fontSize: 11, color: "var(--color-text-secondary, #73726c)", marginBottom: 2 }}>
              {m.label}
            </div>
            <div style={{ fontSize: 20, fontWeight: 500, color: m.color }}>{m.value}</div>
            <div style={{ fontSize: 11, color: "var(--color-text-secondary, #73726c)" }}>{m.sub}</div>
          </div>
        ))}
      </div>

      {/* Toggle */}
      <div style={{ display: "flex", gap: 12, marginBottom: 10, fontSize: 12 }}>
        {[
          { key: false, label: "Cumulative" },
          { key: true, label: "New per month" },
        ].map((opt) => (
          <button
            key={String(opt.key)}
            onClick={() => setShowNew(opt.key)}
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              border: "0.5px solid",
              borderColor: showNew === opt.key ? "#1D9E75" : "var(--color-border-secondary, rgba(0,0,0,0.2))",
              background: showNew === opt.key ? "#E1F5EE" : "transparent",
              color: showNew === opt.key ? "#0F6E56" : "var(--color-text-secondary, #73726c)",
              cursor: "pointer",
              fontFamily: "inherit",
              fontSize: 12,
            }}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Chart */}
      <div style={{ width: "100%", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
            <defs>
              <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#1D9E75" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#1D9E75" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="newGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#378ADD" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#378ADD" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border-tertiary, rgba(0,0,0,0.1))" vertical={false} />
            <XAxis
              dataKey="month"
              tick={{ fontSize: 11, fill: "var(--color-text-secondary, #73726c)" }}
              axisLine={false}
              tickLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "var(--color-text-secondary, #73726c)" }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v) => v >= 1000 ? `${v / 1000}k` : v}
            />
            <Tooltip content={<CustomTooltip />} />
            {!showNew && grantTarget && (
              <ReferenceLine
                y={grantTarget}
                stroke="#7F77DD"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{
                  value: "Grant target",
                  position: "insideTopRight",
                  fontSize: 10,
                  fill: "#7F77DD",
                }}
              />
            )}
            {showNew ? (
              <Area
                type="monotone"
                dataKey="newCustomers"
                name="New customers"
                stroke="#378ADD"
                strokeWidth={2}
                fill="url(#newGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#378ADD" }}
              />
            ) : (
              <Area
                type="monotone"
                dataKey="customers"
                name="Total customers"
                stroke="#1D9E75"
                strokeWidth={2}
                fill="url(#areaGrad)"
                dot={false}
                activeDot={{ r: 4, fill: "#1D9E75" }}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
