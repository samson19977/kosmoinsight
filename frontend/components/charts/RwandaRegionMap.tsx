import React, { useState } from "react";

type RegionKey = "Kigali" | "East" | "South" | "West" | "North";

interface RegionData {
  customers: number;
  percentage: number;
}

interface Props {
  data?: Partial<Record<RegionKey, RegionData>>;
}

const REGIONS: Record<RegionKey, { label: string; path: string; centroid: [number, number]; color: string; darkColor: string }> = {
  Kigali: {
    label: "Kigali City",
    path: "M195 148 L210 142 L222 150 L218 165 L205 170 L193 162 Z",
    centroid: [207, 156],
    color: "#7F77DD",
    darkColor: "#AFA9EC",
  },
  North: {
    label: "Northern",
    path: "M130 60 L200 50 L250 65 L255 110 L215 120 L195 115 L160 125 L120 105 Z",
    centroid: [190, 88],
    color: "#1D9E75",
    darkColor: "#5DCAA5",
  },
  South: {
    label: "Southern",
    path: "M110 195 L195 178 L220 172 L235 178 L240 230 L220 265 L175 275 L130 255 L100 225 Z",
    centroid: [175, 228],
    color: "#D85A30",
    darkColor: "#F0997B",
  },
  East: {
    label: "Eastern",
    path: "M235 110 L310 95 L360 105 L375 145 L360 195 L320 215 L265 210 L240 185 L235 155 L225 135 Z",
    centroid: [303, 160],
    color: "#378ADD",
    darkColor: "#85B7EB",
  },
  West: {
    label: "Western",
    path: "M75 110 L120 100 L160 125 L195 145 L195 178 L110 195 L75 175 L60 145 L65 120 Z",
    centroid: [125, 150],
    color: "#BA7517",
    darkColor: "#EF9F27",
  },
};

const DEFAULT_DATA: Record<RegionKey, RegionData> = {
  Kigali: { customers: 1420, percentage: 38 },
  East:   { customers: 620,  percentage: 17 },
  South:  { customers: 580,  percentage: 15 },
  West:   { customers: 540,  percentage: 14 },
  North:  { customers: 580,  percentage: 16 },
};

export default function RwandaRegionMap({ data = DEFAULT_DATA }: Props) {
  const [hovered, setHovered] = useState<RegionKey | null>(null);
  const isDark =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-color-scheme: dark)").matches;

  const maxCustomers = Math.max(...Object.values(data).map((d) => d?.customers ?? 0));

  const getOpacity = (regionKey: RegionKey) => {
    const val = data[regionKey]?.customers ?? 0;
    return 0.35 + (val / (maxCustomers || 1)) * 0.65;
  };

  const getColor = (regionKey: RegionKey) => {
    const region = REGIONS[regionKey];
    return isDark ? region.darkColor : region.color;
  };

  return (
    <div style={{ width: "100%", fontFamily: "inherit" }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "24px", flexWrap: "wrap" }}>
        {/* Map */}
        <div style={{ flex: "0 0 auto" }}>
          <svg
            viewBox="0 0 430 320"
            width="100%"
            style={{ maxWidth: 400 }}
            role="img"
            aria-label="Map of Rwanda showing customer distribution by region"
          >
            <title>Rwanda customer distribution map</title>
            {(Object.entries(REGIONS) as [RegionKey, typeof REGIONS[RegionKey]][]).map(([key, region]) => (
              <g
                key={key}
                onMouseEnter={() => setHovered(key)}
                onMouseLeave={() => setHovered(null)}
                style={{ cursor: "pointer" }}
              >
                <path
                  d={region.path}
                  fill={getColor(key)}
                  fillOpacity={hovered === key ? 1 : getOpacity(key)}
                  stroke="white"
                  strokeWidth={hovered === key ? 2 : 0.8}
                  style={{ transition: "all 0.2s ease" }}
                />
                <text
                  x={region.centroid[0]}
                  y={region.centroid[1] - 4}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight="600"
                  fill="white"
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {region.label.split(" ")[0]}
                </text>
                <text
                  x={region.centroid[0]}
                  y={region.centroid[1] + 9}
                  textAnchor="middle"
                  fontSize="9"
                  fill="white"
                  fillOpacity={0.9}
                  style={{ pointerEvents: "none", userSelect: "none" }}
                >
                  {data[key]?.customers?.toLocaleString() ?? 0}
                </text>
              </g>
            ))}
          </svg>
        </div>

        {/* Legend + tooltip */}
        <div style={{ flex: 1, minWidth: 160, paddingTop: 16 }}>
          {hovered ? (
            <div
              style={{
                padding: "12px 16px",
                borderRadius: 10,
                border: "0.5px solid var(--color-border-secondary)",
                background: "var(--color-background-primary)",
                marginBottom: 16,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 500, color: "var(--color-text-primary)", marginBottom: 4 }}>
                {REGIONS[hovered].label} Province
              </div>
              <div style={{ fontSize: 22, fontWeight: 500, color: getColor(hovered) }}>
                {data[hovered]?.customers?.toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: "var(--color-text-secondary)" }}>
                customers · {data[hovered]?.percentage}% of total
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: "var(--color-text-secondary)", marginBottom: 16, lineHeight: 1.5 }}>
              Hover a region to see details
            </div>
          )}

          {(Object.entries(REGIONS) as [RegionKey, typeof REGIONS[RegionKey]][]).map(([key, region]) => (
            <div
              key={key}
              onMouseEnter={() => setHovered(key)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "5px 0",
                cursor: "pointer",
                opacity: hovered && hovered !== key ? 0.45 : 1,
                transition: "opacity 0.15s",
              }}
            >
              <div style={{ width: 10, height: 10, borderRadius: 2, background: getColor(key), flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: "var(--color-text-secondary)", flex: 1 }}>
                {region.label}
              </span>
              <span style={{ fontSize: 12, fontWeight: 500, color: "var(--color-text-primary)" }}>
                {data[key]?.percentage}%
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
