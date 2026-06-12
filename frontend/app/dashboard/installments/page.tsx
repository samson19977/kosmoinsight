"use client";
import { useEffect, useState, useRef } from "react";
import { api, Installment, Customer, OverdueSummary, GenerateInstallmentsInput } from "@/lib/api";
import { PageHeader, Btn, Table, Tr, Td, StatusBadge, KpiCard, Loading, Card, InsightCard, ErrorBanner, EmptyState } from "@/components/ui";

export default function InstallmentsPage() {
  const [installments, setInstallments] = useState<Installment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [overdue, setOverdue] = useState<OverdueSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filterCustomer, setFilterCustomer] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [showGenModal, setShowGenModal] = useState(false);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.installments.list({ limit: "500" }),
      api.customers.list(),
      api.installments.overdueSummary(),
    ])
      .then(([inst, custs, ov]) => {
        setInstallments(inst as Installment[]);
        setCustomers(custs as Customer[]);
        setOverdue(ov as OverdueSummary);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  };

  useEffect(() => { load(); }, []);

  const customerName = (id: number) => customers.find(c => c.id === id)?.name || `#${id}`;

  const shown = installments.filter(i => {
    if (filterCustomer && String(i.customer_id) !== filterCustomer) return false;
    if (filterStatus && i.status !== filterStatus) return false;
    return true;
  });

  const paid    = installments.filter(i => i.status === "paid").length;
  const missed  = installments.filter(i => i.status === "missed").length;
  const pending = installments.filter(i => i.status === "pending").length;
  const totalDue = installments.reduce((s, i) => s + i.amount_due, 0);
  const totalCollected = installments.reduce((s, i) => s + i.amount_paid, 0);

  const fmtRWF = (n: number) => n >= 1_000_000
    ? `RWF ${(n / 1_000_000).toFixed(2)}M`
    : `RWF ${(n / 1000).toFixed(0)}K`;

  const handleMarkPaid = async (inst: Installment) => {
    const input = prompt(`Amount paid for installment #${inst.installment_number} (due: ${fmtRWF(inst.amount_due)}):`, String(inst.amount_due));
    if (!input) return;
    const amount = parseFloat(input);
    if (isNaN(amount) || amount < 0) { alert("Invalid amount"); return; }
    try {
      await api.installments.markPaid(inst.id, amount);
      load();
    } catch (e: unknown) {
      alert(e instanceof Error ? e.message : "Error");
    }
  };

  const sel = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 12px", fontSize: 13, background: "#fff", cursor: "pointer" };

  if (loading) return <Loading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
        <PageHeader title="📅 Installments" sub="PayGo payment schedules — track, generate, and mark paid" />
        <Btn onClick={() => setShowGenModal(true)}>+ Generate Schedule</Btn>
      </div>

      {error && <ErrorBanner message={error} />}

      {/* KPIs */}
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
        <KpiCard label="Total Schedules"   value={installments.length} icon="📋" color="#7F77DD" />
        <KpiCard label="Paid"              value={paid}    icon="✅" color="#1D9E75" />
        <KpiCard label="Pending"           value={pending} icon="⏳" color="#EF9F27" />
        <KpiCard label="Missed"            value={missed}  icon="⚠" color="#E24B4A" />
        <KpiCard label="Total Collected"   value={fmtRWF(totalCollected)} icon="💰" color="#185FA5" sub={`of ${fmtRWF(totalDue)} due`} />
      </div>

      {/* Overdue summary */}
      {overdue && overdue.total_overdue > 0 && (
        <Card title="⚠ Overdue Summary">
          <InsightCard type="warning" message={`${overdue.total_overdue} overdue installments totalling ${fmtRWF(overdue.total_amount_overdue)} across ${overdue.by_customer.length} customers.`} />
          <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 6 }}>
            {overdue.by_customer.slice(0, 5).map(c => (
              <div key={c.customer_id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 12px", background: "#FCEBEB", borderRadius: 8, fontSize: 13 }}>
                <span style={{ fontWeight: 500, color: "#1a1a1a" }}>{c.customer_name}</span>
                <span style={{ color: "#A32D2D", fontWeight: 600 }}>{c.overdue_count} missed · {fmtRWF(c.amount_overdue)}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
        <select style={sel} value={filterCustomer} onChange={e => setFilterCustomer(e.target.value)}>
          <option value="">All customers</option>
          {customers.map(c => <option key={c.id} value={String(c.id)}>{c.name}</option>)}
        </select>
        <select style={sel} value={filterStatus} onChange={e => setFilterStatus(e.target.value)}>
          <option value="">All statuses</option>
          {["pending","paid","missed","partial"].map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <span style={{ fontSize: 13, color: "#888" }}>{shown.length} of {installments.length}</span>
      </div>

      {/* Table */}
      {shown.length === 0
        ? <EmptyState message="No installments found. Generate a schedule to get started." action={<Btn onClick={() => setShowGenModal(true)}>+ Generate Schedule</Btn>} />
        : (
          <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
            <Table headers={["Customer", "Installment #", "Due Date", "Amount Due", "Amount Paid", "Balance", "Status", "Actions"]}>
              {shown.map(i => (
                <Tr key={i.id}>
                  <Td><span style={{ fontWeight: 500 }}>{customerName(i.customer_id)}</span></Td>
                  <Td>#{i.installment_number}</Td>
                  <Td style={{ color: "#666" }}>{i.due_date?.slice(0, 10) || "—"}</Td>
                  <Td style={{ fontWeight: 500 }}>RWF {i.amount_due.toLocaleString()}</Td>
                  <Td style={{ color: "#1D9E75" }}>RWF {i.amount_paid.toLocaleString()}</Td>
                  <Td style={{ color: i.amount_due - i.amount_paid > 0 ? "#E24B4A" : "#1D9E75", fontWeight: 500 }}>
                    RWF {Math.max(0, i.amount_due - i.amount_paid).toLocaleString()}
                  </Td>
                  <Td><StatusBadge status={i.status} /></Td>
                  <Td>
                    {(i.status === "pending" || i.status === "missed" || i.status === "partial") && (
                      <Btn size="sm" color="#1D9E75" onClick={() => handleMarkPaid(i)}>Mark Paid</Btn>
                    )}
                  </Td>
                </Tr>
              ))}
            </Table>
          </div>
        )
      }

      {showGenModal && (
        <GenerateModal
          customers={customers}
          onClose={() => setShowGenModal(false)}
          onDone={() => { setShowGenModal(false); load(); }}
        />
      )}
    </div>
  );
}

// ── Generate Schedule Modal ───────────────────────────────────────────────────
function GenerateModal({ customers, onClose, onDone }: {
  customers: Customer[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<GenerateInstallmentsInput>({
    customer_id: 0,
    total_amount: 0,
    num_installments: 12,
    start_date: new Date().toISOString().slice(0, 10),
    frequency: "monthly",
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [search, setSearch] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showDrop, setShowDrop] = useState(false);

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) || c.phone.includes(search)
  ).slice(0, 8);

  const inp: React.CSSProperties = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", background: "#fff" };
  const set = (k: keyof GenerateInstallmentsInput) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm(f => ({ ...f, [k]: k === "customer_id" || k === "total_amount" || k === "num_installments" ? Number(e.target.value) : e.target.value }));

  const perInstallment = form.total_amount > 0 && form.num_installments > 0
    ? Math.ceil(form.total_amount / form.num_installments)
    : 0;

  const handleSubmit = async () => {
    if (!selectedCustomer) { setError("Select a customer"); return; }
    if (form.total_amount <= 0) { setError("Enter total amount"); return; }
    setSaving(true); setError("");
    try {
      await api.installments.generate({ ...form, customer_id: selectedCustomer.id });
      onDone();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to generate");
      setSaving(false);
    }
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: "#1a1a1a" }}>Generate Payment Schedule</h3>

        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Customer search */}
          <div>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Customer *</label>
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <input
                style={{ ...inp, borderColor: selectedCustomer ? "#1D9E75" : "#D3D1C7" }}
                placeholder="Search by name or phone..."
                value={selectedCustomer ? `${selectedCustomer.name} — ${selectedCustomer.phone}` : search}
                onChange={e => { setSearch(e.target.value); setSelectedCustomer(null); setShowDrop(true); }}
                onFocus={() => setShowDrop(true)}
              />
              {showDrop && !selectedCustomer && search.length > 0 && (
                <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #D3D1C7", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, maxHeight: 200, overflowY: "auto" }}>
                  {filtered.length === 0
                    ? <div style={{ padding: "12px 14px", color: "#888", fontSize: 13 }}>No customers found</div>
                    : filtered.map(c => (
                      <div key={c.id} onClick={() => { setSelectedCustomer(c); setShowDrop(false); setSearch(""); }}
                        style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #F0EDE6" }}
                        onMouseEnter={e => (e.currentTarget.style.background = "#F5F3EE")}
                        onMouseLeave={e => (e.currentTarget.style.background = "#fff")}>
                        <div style={{ fontSize: 13, fontWeight: 500 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: "#888" }}>{c.phone} · {c.region}</div>
                      </div>
                    ))
                  }
                </div>
              )}
            </div>
          </div>

          {/* Amount + installments */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Total Amount (RWF) *</label>
              <input style={inp} type="number" placeholder="e.g. 60000" value={form.total_amount || ""} onChange={set("total_amount")} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Number of Installments</label>
              <input style={inp} type="number" min="1" max="60" value={form.num_installments} onChange={set("num_installments")} />
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Start Date</label>
              <input style={inp} type="date" value={form.start_date} onChange={set("start_date")} />
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Frequency</label>
              <select style={{ ...inp, cursor: "pointer" }} value={form.frequency} onChange={set("frequency")}>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
          </div>

          {perInstallment > 0 && (
            <div style={{ background: "#E1F5EE", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
              <span style={{ color: "#0F6E56", fontWeight: 500 }}>Each installment: </span>
              <strong style={{ color: "#085041" }}>RWF {perInstallment.toLocaleString()}</strong>
              <span style={{ color: "#888", marginLeft: 8 }}>({form.num_installments} × {form.frequency})</span>
            </div>
          )}

          {error && <InsightCard type="warning" message={error} />}
        </div>

        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
          <Btn color="#888" onClick={onClose}>Cancel</Btn>
          <Btn onClick={handleSubmit}>{saving ? "Generating…" : "Generate Schedule"}</Btn>
        </div>
      </div>
    </div>
  );
}
