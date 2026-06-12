"use client";
import { useEffect, useState } from "react";
import { api, Notification } from "@/lib/api";
import { PageHeader, Btn, Table, Tr, Td, StatusBadge, KpiCard, Loading, Card, InsightCard, ErrorBanner, EmptyState } from "@/components/ui";

const CHANNEL_ICON: Record<string, string> = { sms: "📱", email: "📧", whatsapp: "💬", in_app: "🔔" };
const CHANNEL_COLOR: Record<string, string> = { sms: "#1D9E75", email: "#185FA5", whatsapp: "#25A244", in_app: "#7F77DD" };

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterChannel, setFilterChannel] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showModal, setShowModal] = useState(false);

  const load = () => {
    setLoading(true);
    api.notifications.list({ limit: "200" })
      .then(n => { setNotifications(n); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const shown = notifications.filter(n => {
    if (filterChannel && n.channel !== filterChannel) return false;
    if (filterStatus && n.status !== filterStatus) return false;
    return true;
  });

  const sent    = notifications.filter(n => n.status === "sent").length;
  const pending = notifications.filter(n => n.status === "pending").length;
  const failed  = notifications.filter(n => n.status === "failed").length;

  const sel: React.CSSProperties = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#fff", cursor: "pointer" };

  if (loading) return <Loading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <PageHeader title="🔔 Notifications" sub="SMS, email, WhatsApp, and in-app message queue" />
        <Btn onClick={() => setShowModal(true)}>+ New Notification</Btn>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Total" value={notifications.length} icon="📨" color="#7F77DD" />
        <KpiCard label="Sent"    value={sent}    icon="✅" color="#1D9E75" />
        <KpiCard label="Pending" value={pending} icon="⏳" color="#EF9F27" />
        <KpiCard label="Failed"  value={failed}  icon="❌" color="#E24B4A" />
      </div>

      {failed > 0 && (
        <InsightCard type="warning" message={`${failed} notification${failed > 1 ? "s" : ""} failed to deliver. Check provider credentials in your backend .env file.`} />
      )}

      {/* Channel breakdown */}
      <Card title="Channel Breakdown">
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["sms","email","whatsapp","in_app"].map(ch => {
            const count = notifications.filter(n => n.channel === ch).length;
            return (
              <div key={ch} style={{ flex: 1, minWidth: 100, background: "#FAFAF8", border: "1px solid #E8E6E0", borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                <div style={{ fontSize: 22, marginBottom: 4 }}>{CHANNEL_ICON[ch]}</div>
                <div style={{ fontSize: 20, fontWeight: 700, color: CHANNEL_COLOR[ch] }}>{count}</div>
                <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", marginTop: 2 }}>{ch.replace("_", " ")}</div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select style={sel} value={filterChannel} onChange={e => setFilterChannel(e.target.value)}>
          <option value="">All channels</option>
          {["sms","email","whatsapp","in_app"].map(c => <option key={c} value={c}>{c.replace("_"," ")}</option>)}
        </select>
        <select style={sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["pending","sent","failed"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#888" }}>{shown.length} of {notifications.length}</span>
      </div>

      {/* Table */}
      {shown.length === 0
        ? <EmptyState message="No notifications yet. Create one to get started." action={<Btn onClick={() => setShowModal(true)}>+ New Notification</Btn>} />
        : (
          <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
            <Table headers={["Channel", "Message", "Customer ID", "Status", "Sent At", "Created At"]}>
              {shown.map(n => (
                <Tr key={n.id}>
                  <Td>
                    <span style={{ background: `${CHANNEL_COLOR[n.channel]}15`, color: CHANNEL_COLOR[n.channel], padding: "2px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>
                      {CHANNEL_ICON[n.channel]} {n.channel.replace("_", " ")}
                    </span>
                  </Td>
                  <Td style={{ maxWidth: 300 }}>
                    <span style={{ display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden", fontSize: 13, color: "#3a3a3a" }}>
                      {n.message}
                    </span>
                  </Td>
                  <Td style={{ color: "#888" }}>{n.customer_id ? `#${n.customer_id}` : "Broadcast"}</Td>
                  <Td><StatusBadge status={n.status} /></Td>
                  <Td style={{ color: "#888", fontSize: 12 }}>{n.sent_at ? new Date(n.sent_at).toLocaleString() : "—"}</Td>
                  <Td style={{ color: "#888", fontSize: 12 }}>{new Date(n.created_at).toLocaleString()}</Td>
                </Tr>
              ))}
            </Table>
          </div>
        )
      }

      {showModal && (
        <NewNotifModal
          onClose={() => setShowModal(false)}
          onDone={() => { setShowModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ── New Notification Modal ────────────────────────────────────────────────────
function NewNotifModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [channel, setChannel] = useState<"sms" | "email" | "whatsapp" | "in_app">("sms");
  const [message, setMessage] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const TEMPLATES = [
    "Your payment of RWF {amount} is due on {date}. Please pay via MTN MoMo or Airtel Money.",
    "Reminder: You have a missed payment. Please contact us to reschedule.",
    "Thank you for your payment! Your account is now up to date.",
    "Your risk score has been updated. Log in to view your account status.",
  ];

  const inp: React.CSSProperties = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", background: "#fff" };

  const handleSubmit = async () => {
    if (!message.trim()) { setError("Message is required"); return; }
    setSaving(true); setError("");
    try {
      await api.notifications.create({
        channel,
        message,
        customer_id: customerId ? parseInt(customerId) : undefined,
      });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to create");
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: "#1a1a1a" }}>New Notification</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 8 }}>Channel</label>
            <div style={{ display: "flex", gap: 8 }}>
              {(["sms","email","whatsapp","in_app"] as const).map(ch => (
                <button key={ch} onClick={() => setChannel(ch)} style={{
                  flex: 1, padding: "8px 4px", border: "1px solid", borderColor: channel === ch ? CHANNEL_COLOR[ch] : "#D3D1C7",
                  borderRadius: 8, background: channel === ch ? `${CHANNEL_COLOR[ch]}15` : "#fff",
                  color: channel === ch ? CHANNEL_COLOR[ch] : "#888", fontSize: 11, fontWeight: 600, cursor: "pointer",
                }}>
                  {CHANNEL_ICON[ch]}<br />{ch.replace("_"," ")}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Customer ID (optional — blank for broadcast)</label>
            <input style={inp} type="number" placeholder="Leave blank to send to all" value={customerId} onChange={e => setCustomerId(e.target.value)} />
          </div>

          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Message *</label>
            <textarea
              style={{ ...inp, minHeight: 100, resize: "vertical" }}
              placeholder="Type your message..."
              value={message}
              onChange={e => setMessage(e.target.value)}
            />
          </div>

          <div>
            <p style={{ fontSize: 12, fontWeight: 600, color: "#444", marginBottom: 8 }}>Quick templates:</p>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {TEMPLATES.map((t, i) => (
                <button key={i} onClick={() => setMessage(t)} style={{
                  textAlign: "left", background: "#F5F3EE", border: "1px solid #E8E6E0",
                  borderRadius: 6, padding: "8px 12px", fontSize: 12, color: "#555", cursor: "pointer",
                }}>
                  {t.slice(0, 70)}…
                </button>
              ))}
            </div>
          </div>

          {error && <InsightCard type="warning" message={error} />}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <Btn color="#888" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSubmit}>{saving ? "Sending…" : "Queue Notification"}</Btn>
        </div>
      </div>
    </div>
  );
}
