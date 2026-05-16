"use client";
import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";

// ─── Sidebar ─────────────────────────────────────────────────────────────────
const NAV = [
  { href: "/dashboard", label: "Dashboard", icon: "⊞" },
  { href: "/dashboard/customers", label: "Customers", icon: "👩" },
  { href: "/dashboard/paygo", label: "PayGo Tracker", icon: "💳" },
  { href: "/dashboard/health", label: "Health Impact", icon: "🏥" },
  { href: "/dashboard/ai", label: "AI Hub", icon: "🤖" },
  { href: "/dashboard/upload", label: "Data Upload", icon: "📤" },
  { href: "/dashboard/reports", label: "Reports", icon: "📊" },
];

export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{
      width: collapsed ? 58 : 220, background: "#1a1a2e", display: "flex",
      flexDirection: "column", transition: "width 0.2s", flexShrink: 0,
      height: "100vh", position: "sticky", top: 0, overflow: "hidden",
    }}>
      {/* Logo */}
      <div style={{ padding: "16px 12px", borderBottom: "1px solid #ffffff15", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 32, height: 32, background: "#7F77DD", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 700, color: "#fff", flexShrink: 0 }}>K</div>
        {!collapsed && <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ color: "#fff", fontWeight: 700, fontSize: 13 }}>KosmoInsight AI</div>
          <div style={{ color: "#7F77DD", fontSize: 10 }}>Smart Analytics</div>
        </div>}
        <button onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, padding: 0, flexShrink: 0 }}>
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {NAV.map(n => {
          const active = pathname === n.href;
          return (
            <button key={n.href} onClick={() => router.push(n.href)} style={{
              background: active ? "#7F77DD20" : "none", border: "none",
              borderLeft: active ? "3px solid #7F77DD" : "3px solid transparent",
              borderRadius: 8, padding: "10px 10px", display: "flex", alignItems: "center",
              gap: 10, cursor: "pointer", width: "100%", textAlign: "left",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0 }}>{n.icon}</span>
              {!collapsed && <span style={{ color: active ? "#a89dff" : "#bbb", fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{n.label}</span>}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div style={{ padding: "12px", borderTop: "1px solid #ffffff15" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: collapsed ? 0 : 8 }}>
          <div style={{ width: 28, height: 28, background: "#1D9E75", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
            {user?.name?.[0] || "U"}
          </div>
          {!collapsed && <div style={{ minWidth: 0 }}>
            <div style={{ color: "#fff", fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user?.name}</div>
            <div style={{ color: "#888", fontSize: 10, textTransform: "capitalize" }}>{user?.role}</div>
          </div>}
        </div>
        {!collapsed && <button onClick={logout} style={{ width: "100%", background: "#ffffff10", border: "none", borderRadius: 6, padding: "6px", color: "#888", fontSize: 12, cursor: "pointer" }}>Logout</button>}
      </div>
    </div>
  );
}

// ─── Layout wrapper ───────────────────────────────────────────────────────────
export function DashLayout({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", height: "100vh", overflow: "hidden" }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: "auto", padding: "28px 32px", background: "#F5F3EE" }}>
        {children}
      </main>
    </div>
  );
}

// ─── Badges ───────────────────────────────────────────────────────────────────
const RISK_COLOR: Record<string, string> = { low: "#1D9E75", medium: "#EF9F27", high: "#E24B4A" };
const RISK_BG: Record<string, string> = { low: "#E1F5EE", medium: "#FAEEDA", high: "#FCEBEB" };
const STATUS_BG: Record<string, string> = { active: "#E1F5EE", completed: "#E6F1FB", suspended: "#FAEEDA", defaulted: "#FCEBEB", paid: "#E1F5EE", pending: "#FAEEDA", missed: "#FCEBEB", partial: "#EEEDFE" };
const STATUS_COLOR: Record<string, string> = { active: "#0F6E56", completed: "#185FA5", suspended: "#BA7517", defaulted: "#A32D2D", paid: "#0F6E56", pending: "#BA7517", missed: "#A32D2D", partial: "#534AB7" };

export function RiskBadge({ level }: { level: string }) {
  return <span style={{ background: RISK_BG[level] || "#F1EFE8", color: RISK_COLOR[level] || "#5F5E5A", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{level}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  return <span style={{ background: STATUS_BG[status] || "#F1EFE8", color: STATUS_COLOR[status] || "#5F5E5A", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>{status}</span>;
}

// ─── KPI Card ────────────────────────────────────────────────────────────────
export function KpiCard({ label, value, sub, color = "#7F77DD", icon }: { label: string; value: string | number; sub?: string; color?: string; icon: string }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderTop: `3px solid ${color}`, borderRadius: 14, padding: "18px 20px", flex: 1, minWidth: 150 }}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#1a1a1a", lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 13, color: "#888", marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 12, color, marginTop: 6, fontWeight: 500 }}>{sub}</div>}
    </div>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
      <div style={{ padding: "16px 20px", borderBottom: "1px solid #E8E6E0", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a" }}>{title}</h3>
        {action}
      </div>
      <div style={{ padding: 20 }}>{children}</div>
    </div>
  );
}

// ─── Insight Card ────────────────────────────────────────────────────────────
export function InsightCard({ type, message }: { type: string; message: string }) {
  const c: Record<string, { bg: string; border: string; text: string; icon: string }> = {
    warning: { bg: "#FAEEDA", border: "#BA7517", text: "#633806", icon: "⚠" },
    success: { bg: "#E1F5EE", border: "#0F6E56", text: "#04342C", icon: "✓" },
    info:    { bg: "#E6F1FB", border: "#185FA5", text: "#042C53", icon: "◉" },
  };
  const s = c[type] || c.info;
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, borderRadius: 10, padding: "12px 16px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 16, color: s.border, flexShrink: 0 }}>{s.icon}</span>
      <p style={{ margin: 0, fontSize: 13.5, color: s.text, lineHeight: 1.5 }}>{message}</p>
    </div>
  );
}

// ─── Btn ─────────────────────────────────────────────────────────────────────
export function Btn({ children, onClick, variant = "primary", small }: { children: React.ReactNode; onClick?: () => void; variant?: "primary" | "ghost" | "danger"; small?: boolean }) {
  const bg = { primary: "#7F77DD", ghost: "#F1EFE8", danger: "#FCEBEB" }[variant];
  const color = { primary: "#fff", ghost: "#444", danger: "#A32D2D" }[variant];
  return (
    <button onClick={onClick} style={{ background: bg, color, border: "none", borderRadius: 8, padding: small ? "5px 12px" : "9px 18px", fontSize: small ? 12 : 14, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap" }}>
      {children}
    </button>
  );
}

// ─── Loading / Error ──────────────────────────────────────────────────────────
export function Loading() {
  return <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 200, color: "#888", fontSize: 14 }}>Loading...</div>;
}

export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12, marginBottom: 24 }}>
      <div>
        <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{title}</h2>
        {sub && <p style={{ fontSize: 14, color: "#888" }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

// ─── Table ────────────────────────────────────────────────────────────────────
export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ background: "#FAFAF8", borderBottom: "1px solid #E8E6E0" }}>
            {headers.map(h => <th key={h} style={{ padding: "11px 14px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#888", whiteSpace: "nowrap" }}>{h}</th>)}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, i = 0 }: { children: React.ReactNode; i?: number }) {
  return <tr style={{ borderBottom: "1px solid #F0EDE6", background: i % 2 === 0 ? "#fff" : "#FAFAF8" }}>{children}</tr>;
}

export function Td({ children, bold }: { children: React.ReactNode; bold?: boolean }) {
  return <td style={{ padding: "11px 14px", fontSize: 13, color: bold ? "#1a1a1a" : "#555", fontWeight: bold ? 500 : 400 }}>{children}</td>;
}
