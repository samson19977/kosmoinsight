import React from "react";
import {
  RadialBarChart,
  RadialBar,
  ResponsiveContainer,
  PolarAngleAxis,
} from "recharts";

// Props:
//   rate   – current repayment rate (0–100)
//   target – target rate (default 85)
export default function RepaymentGauge({ rate = 78, target = 85 }) {
  const isOnTarget = rate >= target;

  // Color based on performance
  const getColor = () => {
    if (rate >= target) return "#1D9E75";       // green – on/above target
    if (rate >= target - 10) return "#EF9F27";  // amber – close
    return "#D85A30";                            // coral – below
  };

  const accentColor = getColor();

  // Recharts radial data — value drives the arc fill
  const data = [{ value: rate, fill: accentColor }];

  return (
    <div style={{ width: "100%", textAlign: "center" }}>
      <div style={{ position: "relative", width: "100%", height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <RadialBarChart
            cx="50%"
            cy="80%"
            innerRadius="60%"
            outerRadius="90%"
            startAngle={180}
            endAngle={0}
            data={data}
            barSize={18}
          >
            {/* Background track */}
            <RadialBar
              dataKey="value"
              cornerRadius={9}
              background={{ fill: "var(--color-background-secondary, #f0ede6)" }}
            />
            <PolarAngleAxis
              type="number"
              domain={[0, 100]}
              angleAxisId={0}
              tick={false}
            />
          </RadialBarChart>
        </ResponsiveContainer>

        {/* Target needle */}
        <svg
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            overflow: "visible",
            pointerEvents: "none",
          }}
          viewBox="0 0 300 200"
        >
          {/* Target tick mark */}
          {(() => {
            const cx = 150;
            const cy = 160;
            const angle = 180 - target * 1.8; // 180° to 0°
            const rad = (angle * Math.PI) / 180;
            const r1 = 74;
            const r2 = 90;
            const x1 = cx + r1 * Math.cos(rad);
            const y1 = cy - r1 * Math.sin(rad);
            const x2 = cx + r2 * Math.cos(rad);
            const y2 = cy - r2 * Math.sin(rad);
            return (
              <line
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#73726c"
                strokeWidth="2"
                strokeDasharray="3 2"
              />
            );
          })()}

          {/* Target label */}
          {(() => {
            const cx = 150;
            const cy = 160;
            const angle = 180 - target * 1.8;
            const rad = (angle * Math.PI) / 180;
            const r = 102;
            const tx = cx + r * Math.cos(rad);
            const ty = cy - r * Math.sin(rad);
            return (
              <text
                x={tx}
                y={ty + 4}
                textAnchor="middle"
                fontSize="9"
                fill="#73726c"
                fontFamily="inherit"
              >
                {target}%
              </text>
            );
          })()}
        </svg>

        {/* Center value */}
        <div
          style={{
            position: "absolute",
            bottom: 4,
            left: "50%",
            transform: "translateX(-50%)",
            textAlign: "center",
            lineHeight: 1.1,
          }}
        >
          <div
            style={{
              fontSize: 36,
              fontWeight: 500,
              color: accentColor,
              letterSpacing: "-1px",
            }}
          >
            {rate}%
          </div>
        </div>
      </div>

      {/* Status badge */}
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          marginTop: 4,
          padding: "3px 10px",
          borderRadius: 20,
          fontSize: 12,
          fontWeight: 500,
          background: isOnTarget ? "#E1F5EE" : "#FAECE7",
          color: isOnTarget ? "#0F6E56" : "#993C1D",
        }}
      >
        {isOnTarget ? "✓ Target met" : `${target - rate}% below target`}
      </div>

      {/* Sub-labels */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 10,
          fontSize: 11,
          color: "var(--color-text-secondary, #73726c)",
          padding: "0 12px",
        }}
      >
        <span>0%</span>
        <span style={{ fontSize: 11 }}>Repayment rate</span>
        <span>100%</span>
      </div>
    </div>
  );
}
