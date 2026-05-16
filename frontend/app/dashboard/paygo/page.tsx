"use client";
import { useEffect, useState } from "react";
import { api, Payment, Customer } from "@/lib/api";
import { PageHeader, Btn, Table, Tr, Td, StatusBadge, KpiCard, Loading } from "@/components/ui";

export default function PayGoPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({ customer_id: 0, amount_due: 0, amount_paid: 0, installment_number: 1 });

  const load = () => {
    Promise.all([api.payments.list(), api.customers.list()]).then(([p, c]) => {
      setPayments(p as Payment[]);
      setCustomers(c as Customer[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const paid = payments.filter(p => p.status === "paid");
  const missed = payments.filter(p => p.status === "missed");
  const pending = payments.filter(p => p.status === "pending");
  const totalDue = payments.reduce((s, p) => s + p.amount_due, 0);
  const totalCollected = payments.reduce((s, p) => s + p.amount_paid, 0);
  const customerName = (id: number) => customers.find(c => c.id === id)?.name || `Customer #${id}`;

  const inp = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none", width: "100%" };

  const handleCreate = async () => {
    if (!form.customer_id) return alert("Select a customer");
    await api.payments.create(form);
    setShowModal(false);
    load();
  };

  const markPaid = async (id: number) => {
    const p = payments.find(x => x.id === id)!;
    await api.payments.update(id, { amount_paid: p.amount_due, status: "paid", paid_date: new Date().toISOString() });
    load();
  };

  const markMissed = async (id: number) => {
    await api.payments.update(id, { status: "missed" });
    load();
  };

  return (
    <div>
      <PageHeader title="PayGo Repayment Tracker" sub="Monitor installment payments and alerts" action={<Btn onClick={() => setShowModal(true)}>+ Record Payment</Btn>} />

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <KpiCard label="Total Collected" value={`RWF ${(totalCollected / 1000).toFixed(0)}K`} color="#1D9E75" icon="✓" />
        <KpiCard label="Outstanding" value={`RWF ${((totalDue - totalCollected) / 1000).toFixed(0)}K`} color="#E24B4A" icon="⚠" />
        <KpiCard label="Paid Installments" value={paid.length} color="#1D9E75" icon="📗" />
        <KpiCard label="Missed Payments" value={missed.length} sub="Needs follow-up" color="#E24B4A" icon="📕" />
        <KpiCard label="Pending" value={pending.length} color="#EF9F27" icon="📙" />
        <KpiCard label="Collection Rate" value={`${totalDue > 0 ? ((totalCollected / totalDue) * 100).toFixed(1) : 0}%`} color="#7F77DD" icon="↗" />
      </div>

      <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
        {loading ? <Loading /> : (
          <Table headers={["Customer", "#", "Amount Due", "Amount Paid", "Balance", "Due Date", "Status", "Actions"]}>
            {payments.length === 0
              ? <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#888" }}>No payment records. Add customers and record payments.</td></tr>
              : payments.map((p, i) => (
                <Tr key={p.id} i={i}>
                  <Td bold>{customerName(p.customer_id)}</Td>
                  <Td>{p.installment_number || "—"}</Td>
                  <Td>RWF {p.amount_due.toFixed(0)}</Td>
                  <Td>RWF {p.amount_paid.toFixed(0)}</Td>
                  <td style={{ padding: "11px 14px", fontSize: 13, color: (p.remaining_balance || 0) > 0 ? "#E24B4A" : "#1D9E75", fontWeight: 500 }}>
                    RWF {(p.remaining_balance || 0).toFixed(0)}
                  </td>
                  <Td>{p.due_date ? new Date(p.due_date).toLocaleDateString() : "—"}</Td>
                  <td style={{ padding: "11px 14px" }}><StatusBadge status={p.status} /></td>
                  <td style={{ padding: "11px 14px" }}>
                    {p.status === "pending" && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn small onClick={() => markPaid(p.id)}>Mark Paid</Btn>
                        <Btn small variant="danger" onClick={() => markMissed(p.id)}>Missed</Btn>
                      </div>
                    )}
                  </td>
                </Tr>
              ))}
          </Table>
        )}
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 440 }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: "#1a1a1a" }}>Record Payment Installment</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 500, color: "#666", display: "block", marginBottom: 5 }}>Customer *</label>
                <select style={inp} value={form.customer_id} onChange={e => setForm(f => ({ ...f, customer_id: +e.target.value }))}>
                  <option value={0}>Select customer...</option>
                  {customers.map(c => <option key={c.id} value={c.id}>{c.name} — {c.phone}</option>)}
                </select>
              </div>
              {[["amount_due", "Amount Due (RWF)"], ["amount_paid", "Amount Paid (RWF)"], ["installment_number", "Installment #"]].map(([k, label]) => (
                <div key={k}>
                  <label style={{ fontSize: 12, fontWeight: 500, color: "#666", display: "block", marginBottom: 5 }}>{label}</label>
                  <input style={inp} type="number" value={(form as Record<string, number>)[k]} onChange={e => setForm(f => ({ ...f, [k]: +e.target.value }))} />
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              <Btn variant="ghost" onClick={() => setShowModal(false)}>Cancel</Btn>
              <Btn onClick={handleCreate}>Save Payment</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
