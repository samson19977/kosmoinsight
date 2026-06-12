"use client";
import { useEffect, useState } from "react";
import { api, AuditLog } from "@/lib/api";
import { PageHeader, Table, Tr, Td, Loading, KpiCard, Card, InsightCard, ErrorBanner, EmptyState } from "@/components/ui";
import { useAuth } from "@/lib/auth-context";
import { useRouter } from "next/navigation";

const ACTION_COLOR: Record<string, string> = {
  create: "#1D9E75", update: "#185FA5", delete: "#E24B4A",
  login: "#7F77DD", logout: "#EF9F27", default: "#888",
};
const ACTION_BG: Record<string, string> = {
  create: "#E1F5EE", update: "#E6F1FB", delete: "#FCEBEB",
  login: "#EEEDFE", logout: "#FAEEDA", default: "#F1EFE8",
};

export default function AuditPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterAction, setFilterAction] = useState("");
  const [filterResource, setFilterResource] = useState("");
  const [search, setSearch] = useState("");

  // Admin-only guard
  useEffect(() => {
    if (user && user.role !== "admin") {
      router.replace("/dashboard");
    }
  }, [user, router]);

  useEffect(() => {
    api.audit.list({ limit: "500" })
      .then(l => { setLogs(l); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, []);

  const resources = [...new Set(logs.map(l => l.resource))].filter(Boolean);
  const actions   = [...new Set(logs.map(l => l.action))].filter(Boolean);

  const shown = logs.filter(l => {
    if (filterAction   && l.action   !== filterAction)   return false;
    if (filterResource && l.resource !== filterResource) return false;
    if (search && !`${l.user_email} ${l.resource} ${l.detail} ${l.ip_address}`.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  });

  const creates = logs.filter(l => l.action === "create").length;
  const updates = logs.filter(l => l.action === "update").length;
  const deletes = logs.filter(l => l.action === "delete").length;

  const sel: React.CSSProperties = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#fff", cursor: "pointer" };
  const inp: React.CSSProperties = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", background: "#fff" };

  if (loading) return <Loading />;
  if (user?.role !== "admin") return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="🔍 Audit Log" sub="Every create, update, and delete recorded — admin access only" />

      {error && <ErrorBanner message={error} />}

      <InsightCard type="info" message="All data-changing actions are recorded here with the user, resource, IP address, and timestamp." />

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Total Events" value={logs.length}  icon="📋" color="#7F77DD" />
        <KpiCard label="Creates"      value={creates}      icon="➕" color="#1D9E75" />
        <KpiCard label="Updates"      value={updates}      icon="✏️" color="#185FA5" />
        <KpiCard label="Deletes"      value={deletes}      icon="🗑️" color="#E24B4A" />
      </div>

      {/* Recent actions summary */}
      <Card title="Recent Activity (last 10 events)">
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {logs.slice(0, 10).map(l => {
            const actionKey = l.action?.toLowerCase() || "default";
            return (
              <div key={l.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 12px", background: "#FAFAF8", borderRadius: 8, fontSize: 13 }}>
                <span style={{ background: ACTION_BG[actionKey] || ACTION_BG.default, color: ACTION_COLOR[actionKey] || ACTION_COLOR.default, padding: "2px 8px", borderRadius: 20, fontSize: 11, fontWeight: 700, textTransform: "uppercase", flexShrink: 0 }}>
                  {l.action}
                </span>
                <span style={{ color: "#7F77DD", fontWeight: 500 }}>{l.resource}</span>
                {l.resource_id && <span style={{ color: "#888" }}>#{l.resource_id}</span>}
                <span style={{ color: "#aaa", marginLeft: "auto", fontSize: 11 }}>{l.user_email || "system"}</span>
                <span style={{ color: "#ccc", fontSize: 11 }}>{new Date(l.created_at).toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <input style={{ ...inp, width: 200 }} placeholder="Search user, detail, IP…" value={search} onChange={e => setSearch(e.target.value)} />
        <select style={sel} value={filterAction} onChange={e => setFilterAction(e.target.value)}>
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select style={sel} value={filterResource} onChange={e => setFilterResource(e.target.value)}>
          <option value="">All resources</option>
          {resources.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#888" }}>{shown.length} of {logs.length}</span>
      </div>

      {/* Table */}
      {shown.length === 0
        ? <EmptyState message="No audit events match your filters." />
        : (
          <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
            <Table headers={["Action", "Resource", "ID", "User", "IP Address", "Detail", "Timestamp"]}>
              {shown.map(l => {
                const actionKey = l.action?.toLowerCase() || "default";
                return (
                  <Tr key={l.id}>
                    <Td>
                      <span style={{ background: ACTION_BG[actionKey] || ACTION_BG.default, color: ACTION_COLOR[actionKey] || ACTION_COLOR.default, padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 700, textTransform: "uppercase" }}>
                        {l.action}
                      </span>
                    </Td>
                    <Td style={{ fontWeight: 500, color: "#7F77DD" }}>{l.resource}</Td>
                    <Td style={{ color: "#888" }}>{l.resource_id ? `#${l.resource_id}` : "—"}</Td>
                    <Td style={{ fontSize: 12 }}>{l.user_email || <span style={{ color: "#aaa" }}>system</span>}</Td>
                    <Td style={{ fontSize: 12, color: "#888", fontFamily: "monospace" }}>{l.ip_address || "—"}</Td>
                    <Td style={{ fontSize: 12, color: "#555", maxWidth: 240 }}>
                      <span style={{ display: "-webkit-box", WebkitLineClamp: 1, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                        {l.detail || "—"}
                      </span>
                    </Td>
                    <Td style={{ fontSize: 12, color: "#888", whiteSpace: "nowrap" }}>
                      {new Date(l.created_at).toLocaleString()}
                    </Td>
                  </Tr>
                );
              })}
            </Table>
          </div>
        )
      }
    </div>
  );
}
