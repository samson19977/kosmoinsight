"use client";
import { useAuth } from "@/lib/auth-context";
import { usePathname, useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { api } from "@/lib/api";

// ─── Sidebar nav ─────────────────────────────────────────────────────────────
const NAV = [
  { href: "/dashboard",                  label: "Dashboard",       icon: "⊞" },
  { href: "/dashboard/customers",        label: "Customers",       icon: "👩" },
  { href: "/dashboard/paygo",            label: "PayGo Tracker",   icon: "💳" },
  { href: "/dashboard/installments",     label: "Installments",    icon: "📅" },
  { href: "/dashboard/health",           label: "Health Impact",   icon: "🏥" },
  { href: "/dashboard/ai",               label: "AI Hub",          icon: "🤖" },
  { href: "/dashboard/upload",           label: "Data Upload",     icon: "📤" },
  { href: "/dashboard/reports",          label: "Reports",         icon: "📊" },
  { href: "/dashboard/notifications",    label: "Notifications",   icon: "🔔" },
];

const ADMIN_NAV = [
  { href: "/dashboard/audit",            label: "Audit Log",       icon: "🔍" },
];

// ─── Sidebar ─────────────────────────────────────────────────────────────────
export function Sidebar() {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const [collapsed, setCollapsed] = useState(false);
  const [unread, setUnread] = useState(0);

  // Poll notification count every 60s
  useEffect(() => {
    const fetch = () => api.notifications.unreadCount()
      .then(r => setUnread(r.count))
      .catch(() => {});
    fetch();
    const id = setInterval(fetch, 60_000);
    return () => clearInterval(id);
  }, []);

  const allNav = user?.role === "admin" ? [...NAV, ...ADMIN_NAV] : NAV;

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
          <div style={{ color: "#7F77DD", fontSize: 10 }}>Smart Analytics v2</div>
        </div>}
        <button onClick={() => setCollapsed(!collapsed)} style={{ background: "none", border: "none", color: "#666", cursor: "pointer", fontSize: 18, padding: 0, flexShrink: 0 }}>
          {collapsed ? "›" : "‹"}
        </button>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: "10px 8px", display: "flex", flexDirection: "column", gap: 2, overflowY: "auto" }}>
        {allNav.map(n => {
          const active = pathname === n.href;
          const isNotif = n.href.includes("notifications");
          return (
            <button key={n.href} onClick={() => router.push(n.href)} style={{
              background: active ? "#7F77DD20" : "none", border: "none",
              borderLeft: active ? "3px solid #7F77DD" : "3px solid transparent",
              borderRadius: 8, padding: "10px 10px", display: "flex", alignItems: "center",
              gap: 10, cursor: "pointer", width: "100%", textAlign: "left", position: "relative",
            }}>
              <span style={{ fontSize: 16, flexShrink: 0, position: "relative" }}>
                {n.icon}
                {isNotif && unread > 0 && (
                  <span style={{
                    position: "absolute", top: -4, right: -6, background: "#E24B4A",
                    color: "#fff", borderRadius: "50%", fontSize: 9, fontWeight: 700,
                    width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center",
                  }}>{unread > 9 ? "9+" : unread}</span>
                )}
              </span>
              {!collapsed && (
                <span style={{ color: active ? "#a89dff" : "#bbb", fontSize: 13, fontWeight: active ? 600 : 400, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {n.label}
                  {isNotif && unread > 0 && !active && (
                    <span style={{ marginLeft: 6, background: "#E24B4A", color: "#fff", borderRadius: 10, fontSize: 10, padding: "1px 5px" }}>{unread}</span>
                  )}
                </span>
              )}
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
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: "uppercase", padding: "1px 6px", borderRadius: 4, marginTop: 2, display: "inline-block", background: user?.role === "admin" ? "#7F77DD" : user?.role === "staff" ? "#1D9E75" : "#185FA5", color: "#fff" }}>{user?.role}</div>
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
const RISK_BG:    Record<string, string> = { low: "#E1F5EE", medium: "#FAEEDA", high: "#FCEBEB" };
const STATUS_BG:  Record<string, string> = {
  active: "#E1F5EE", completed: "#E6F1FB", suspended: "#FAEEDA", defaulted: "#FCEBEB",
  paid: "#E1F5EE", pending: "#FAEEDA", missed: "#FCEBEB", partial: "#EEEDFE",
  sent: "#E1F5EE", failed: "#FCEBEB",
};
const STATUS_COLOR: Record<string, string> = {
  active: "#0F6E56", completed: "#185FA5", suspended: "#BA7517", defaulted: "#A32D2D",
  paid: "#0F6E56", pending: "#BA7517", missed: "#A32D2D", partial: "#534AB7",
  sent: "#0F6E56", failed: "#A32D2D",
};

export function RiskBadge({ level }: { level: string }) {
  return (
    <span style={{ background: RISK_BG[level] || "#F1EFE8", color: RISK_COLOR[level] || "#5F5E5A", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
      {level}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  return (
    <span style={{ background: STATUS_BG[status] || "#F1EFE8", color: STATUS_COLOR[status] || "#5F5E5A", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600, textTransform: "capitalize" }}>
      {status}
    </span>
  );
}

// ─── Shared primitives ────────────────────────────────────────────────────────
export function Loading({ text = "Loading…" }: { text?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", padding: 60, color: "#888", fontSize: 14, gap: 10 }}>
      <span style={{ display: "inline-block", width: 18, height: 18, border: "2px solid #7F77DD", borderTop: "2px solid transparent", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
      {text}
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}

export function PageHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <h2 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{title}</h2>
      {sub && <p style={{ fontSize: 14, color: "#888" }}>{sub}</p>}
    </div>
  );
}

export function Card({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, padding: 20 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h3 style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", margin: 0 }}>{title}</h3>
        {action}
      </div>
      {children}
    </div>
  );
}

export function KpiCard({
  label, value, sub, color = "#7F77DD", icon,
}: {
  label: string; value: string | number; sub?: string; color?: string; icon?: string;
}) {
  return (
    <div style={{ flex: "1 1 160px", minWidth: 150, background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, padding: "16px 18px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
        {icon && <span style={{ fontSize: 18 }}>{icon}</span>}
        <span style={{ fontSize: 12, color: "#888", fontWeight: 500 }}>{label}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 700, color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: "#aaa", marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export function InsightCard({ type, message }: { type: "warning" | "info" | "success"; message: string }) {
  const cfg = {
    warning: { bg: "#FAEEDA", color: "#BA7517", icon: "⚠" },
    info:    { bg: "#E6F1FB", color: "#185FA5", icon: "ℹ" },
    success: { bg: "#E1F5EE", color: "#0F6E56", icon: "✓" },
  }[type];
  return (
    <div style={{ background: cfg.bg, borderRadius: 8, padding: "10px 14px", display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ color: cfg.color, fontWeight: 700, flexShrink: 0 }}>{cfg.icon}</span>
      <span style={{ fontSize: 13, color: cfg.color, lineHeight: 1.5 }}>{message}</span>
    </div>
  );
}

export function Btn({
  children, onClick, color = "#7F77DD", disabled = false, size = "md",
}: {
  children: React.ReactNode; onClick?: () => void; color?: string; disabled?: boolean; size?: "sm" | "md";
}) {
  const pad = size === "sm" ? "6px 14px" : "10px 20px";
  const fs  = size === "sm" ? 12 : 14;
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: disabled ? "#ccc" : color, color: "#fff", border: "none",
        borderRadius: 8, padding: pad, fontSize: fs, fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer", whiteSpace: "nowrap",
      }}
    >
      {children}
    </button>
  );
}

export function Table({ headers, children }: { headers: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr style={{ borderBottom: "1px solid #E8E6E0" }}>
            {headers.map(h => (
              <th key={h} style={{ padding: "10px 12px", textAlign: "left", color: "#888", fontWeight: 600, fontSize: 12, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Tr({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) {
  return (
    <tr
      onClick={onClick}
      style={{ borderBottom: "1px solid #F0EDE6", cursor: onClick ? "pointer" : undefined, transition: "background 0.1s" }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLElement).style.background = "#FAFAF8"; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ""; }}
    >
      {children}
    </tr>
  );
}

export function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "10px 12px", color: "#3a3a3a", ...style }}>{children}</td>;
}

export function EmptyState({ message, action }: { message: string; action?: React.ReactNode }) {
  return (
    <div style={{ textAlign: "center", padding: "40px 20px", color: "#aaa" }}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>📭</div>
      <p style={{ fontSize: 14, marginBottom: action ? 16 : 0 }}>{message}</p>
      {action}
    </div>
  );
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div style={{ background: "#FCEBEB", border: "1px solid #E24B4A20", borderRadius: 10, padding: "12px 16px", color: "#A32D2D", fontSize: 13, marginBottom: 16 }}>
      ⚠ {message}
    </div>
  );
}
