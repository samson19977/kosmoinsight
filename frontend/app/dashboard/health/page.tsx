"use client";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { PageHeader, Btn, KpiCard, Table, Tr, Td, Loading, Card } from "@/components/ui";

interface HealthSession {
  id: number; title: string; topic?: string; region?: string;
  facilitator?: string; session_date?: string; expected_attendance?: number; created_at: string;
}
interface HealthImpact {
  total_sessions: number; total_attendees: number; avg_feedback_score: number;
}

const TOPICS = ["menstrual_hygiene", "maternal_care", "nutrition", "family_planning", "reproductive_health"];
const TOPIC_COLOR: Record<string, string> = {
  menstrual_hygiene: "#7F77DD", maternal_care: "#1D9E75",
  nutrition: "#EF9F27", family_planning: "#378ADD", reproductive_health: "#D85A30"
};
const REGIONS = ["Kigali", "Northern", "Southern", "Eastern", "Western"];

export default function HealthPage() {
  const [sessions, setSessions] = useState<HealthSession[]>([]);
  const [impact, setImpact] = useState<HealthImpact | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  // Form — note: no hardcoded expected_attendance default
  const emptyForm = { title: "", topic: "menstrual_hygiene", region: "Kigali", facilitator: "", session_date: "", duration_minutes: "", expected_attendance: "" };
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = () => {
    setLoading(true);
    Promise.all([api.health.list(), api.analytics.healthImpact()])
      .then(([s, h]) => {
        setSessions(s as HealthSession[]);
        setImpact(h as HealthImpact);
        setLoading(false);
      }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const inp = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", background: "#fff" };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const handleCreate = async () => {
    if (!form.title.trim()) { setError("Session title is required"); return; }
    setSaving(true); setError("");
    try {
      await api.health.create({
        ...form,
        duration_minutes: form.duration_minutes ? +form.duration_minutes : null,
        expected_attendance: form.expected_attendance ? +form.expected_attendance : null,
        session_date: form.session_date ? new Date(form.session_date).toISOString() : null,
      });
      setShowModal(false);
      setForm(emptyForm);
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save session");
    } finally { setSaving(false); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm("Delete this health session?")) return;
    setDeleting(id);
    try {
      await api.health.delete(id);
      load();
    } catch {
      alert("Could not delete session");
    } finally { setDeleting(null); }
  };

  return (
    <div>
      <PageHeader
        title="Health Impact Tracker"
        sub={`${sessions.length} community health sessions recorded`}
        action={<Btn onClick={() => { setForm(emptyForm); setError(""); setShowModal(true); }}>+ New Session</Btn>}
      />

      {/* KPI cards */}
      {impact && (
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
          <KpiCard label="Total Sessions" value={impact.total_sessions} color="#1D9E75" icon="🏥" />
          <KpiCard label="Total Attendees" value={impact.total_attendees} sub="Community members reached" color="#185FA5" icon="👥" />
          <KpiCard label="Avg Feedback Score" value={`${impact.avg_feedback_score}/5`} sub="Satisfaction rating" color="#7F77DD" icon="⭐" />
        </div>
      )}

      {/* Topic breakdown */}
      <Card title="Sessions by Topic">
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {TOPICS.map(topic => {
            const count = sessions.filter(s => s.topic === topic).length;
            const color = TOPIC_COLOR[topic] || "#888";
            return (
              <div key={topic} style={{ flex: 1, minWidth: 120, border: `2px solid ${color}20`, borderLeft: `4px solid ${color}`, borderRadius: 10, padding: "12px 14px" }}>
                <p style={{ fontSize: 22, fontWeight: 700, color, marginBottom: 4 }}>{count}</p>
                <p style={{ fontSize: 12, color: "#666", textTransform: "capitalize" }}>{topic.replace(/_/g, " ")}</p>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Sessions table */}
      <div style={{ marginTop: 24, background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
        {loading ? <Loading /> : (
          <Table headers={["Title", "Topic", "Region", "Facilitator", "Date", "Expected", "Actions"]}>
            {sessions.length === 0
              ? <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#888" }}>
                  No health sessions yet. Click &quot;+ New Session&quot; to add one.
                </td></tr>
              : sessions.map((s, i) => (
                <Tr key={s.id} i={i}>
                  <Td bold>{s.title}</Td>
                  <td style={{ padding: "11px 14px" }}>
                    {s.topic && (
                      <span style={{ background: `${TOPIC_COLOR[s.topic] || "#888"}20`, color: TOPIC_COLOR[s.topic] || "#888", padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 500, textTransform: "capitalize" }}>
                        {s.topic.replace(/_/g, " ")}
                      </span>
                    )}
                  </td>
                  <Td>{s.region || "—"}</Td>
                  <Td>{s.facilitator || "—"}</Td>
                  <Td>{s.session_date ? new Date(s.session_date).toLocaleDateString() : "—"}</Td>
                  <Td>{s.expected_attendance ?? "—"}</Td>
                  <td style={{ padding: "11px 14px" }}>
                    <Btn small variant="danger" onClick={() => handleDelete(s.id)}>
                      {deleting === s.id ? "..." : "Delete"}
                    </Btn>
                  </td>
                </Tr>
              ))}
          </Table>
        )}
      </div>

      {/* New Session Modal */}
      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 500, maxHeight: "92vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: "#1a1a1a" }}>New Health Session</h3>

            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Session Title *</label>
                <input style={inp} placeholder="e.g. Menstrual Hygiene Workshop #5" value={form.title} onChange={set("title")} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Topic</label>
                  <select style={inp} value={form.topic} onChange={set("topic")}>
                    {TOPICS.map(o => <option key={o} value={o}>{o.replace(/_/g, " ")}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Region</label>
                  <select style={inp} value={form.region} onChange={set("region")}>
                    {REGIONS.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Facilitator Name</label>
                <input style={inp} placeholder="e.g. Dr. Mutesi" value={form.facilitator} onChange={set("facilitator")} />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Session Date</label>
                  <input style={inp} type="date" value={form.session_date} onChange={set("session_date")} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Duration (minutes)</label>
                  <input style={inp} type="number" placeholder="e.g. 90" value={form.duration_minutes} onChange={set("duration_minutes")} />
                </div>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Expected Attendance</label>
                <input style={inp} type="number" placeholder="How many people expected?" value={form.expected_attendance} onChange={set("expected_attendance")} />
              </div>

              {error && (
                <div style={{ background: "#FCEBEB", border: "1px solid #E24B4A", borderRadius: 8, padding: "10px 14px", color: "#A32D2D", fontSize: 13 }}>
                  {error}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn onClick={handleCreate}>{saving ? "Saving..." : "Save Session"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
