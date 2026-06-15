"use client";
import { useEffect, useState, useRef } from "react";
import { api, Payment, Customer } from "@/lib/api";
import { PageHeader, Btn, Table, Tr, Td, StatusBadge, KpiCard, Loading } from "@/components/ui";

export default function PayGoPage() {
  const [payments, setPayments] = useState<Payment[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [filterCustomer, setFilterCustomer] = useState("");

  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [amountDue, setAmountDue] = useState("");
  const [amountPaid, setAmountPaid] = useState("");
  const [installmentNum, setInstallmentNum] = useState("1");
  const [dueDate, setDueDate] = useState("");
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const load = () => {
    setLoading(true);
    Promise.all([api.payments.list(), api.customers.list()])
      .then(([p, c]) => {
        setPayments(p as Payment[]);
        setCustomers(c as Customer[]);
        setLoading(false);
      }).catch(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const filteredCustomers = customers.filter(c =>
    c.name.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.phone.includes(customerSearch)
  ).slice(0, 8);

  const shownPayments = filterCustomer
    ? payments.filter(p => String(p.customer_id) === filterCustomer)
    : payments;

  const paid = payments.filter(p => p.status === "paid");
  const missed = payments.filter(p => p.status === "missed");
  const pending = payments.filter(p => p.status === "pending");
  const totalDue = payments.reduce((s, p) => s + p.amount_due, 0);
  const totalCollected = payments.reduce((s, p) => s + p.amount_paid, 0);
  const customerName = (id: number) => customers.find(c => c.id === id)?.name || `Customer #${id}`;

  const inp = { border: "1px solid #D3D1C7", borderRadius: 8, padding: "9px 12px", fontSize: 13, outline: "none", width: "100%", background: "#fff" };

  const resetForm = () => {
    setSelectedCustomer(null);
    setCustomerSearch("");
    setAmountDue("");
    setAmountPaid("0");
    setInstallmentNum("1");
    setDueDate("");
  };

  const handleCreate = async () => {
    if (!selectedCustomer) return alert("Please select a customer");
    if (!amountDue || +amountDue <= 0) return alert("Enter a valid amount due");
    setSaving(true);
    try {
      await api.payments.create({
        customer_id: selectedCustomer.id,
        amount_due: +amountDue,
        amount_paid: +amountPaid || 0,
        installment_number: +installmentNum || 1,
        due_date: dueDate ? new Date(dueDate).toISOString() : null,
      });
      const updatedPayments = await api.customers.payments(selectedCustomer.id) as { payments: Payment[] };
      await api.payments.autoRisk(selectedCustomer.id, updatedPayments.payments || []);
      setShowModal(false);
      resetForm();
      load();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Error saving payment");
    } finally { setSaving(false); }
  };

  const markPaid = async (p: Payment) => {
    await api.payments.update(p.id, { amount_paid: p.amount_due, status: "paid", paid_date: new Date().toISOString() });
    const allCustomerPayments = [...payments.filter(x => x.customer_id === p.customer_id && x.id !== p.id), { ...p, status: "paid" }];
    await api.payments.autoRisk(p.customer_id, allCustomerPayments);
    load();
  };

  const markMissed = async (p: Payment) => {
    await api.payments.update(p.id, { status: "missed" });
    const allCustomerPayments = [...payments.filter(x => x.customer_id === p.customer_id && x.id !== p.id), { ...p, status: "missed" }];
    await api.payments.autoRisk(p.customer_id, allCustomerPayments);
    load();
  };

  return (
    <div>
      <PageHeader
        title="PayGo Repayment Tracker"
        sub="Monitor installment payments — risk scores update automatically"
        action={<Btn onClick={() => { resetForm(); setShowModal(true); }}>+ Record Payment</Btn>}
      />

      <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginBottom: 24 }}>
        <KpiCard label="Total Collected" value={`RWF ${(totalCollected / 1000).toFixed(0)}K`} color="#1D9E75" icon="✓" />
        <KpiCard label="Outstanding" value={`RWF ${((totalDue - totalCollected) / 1000).toFixed(0)}K`} color="#E24B4A" icon="⚠" />
        <KpiCard label="Paid" value={paid.length} color="#1D9E75" icon="📗" />
        <KpiCard label="Missed" value={missed.length} sub="Risk auto-updated" color="#E24B4A" icon="📕" />
        <KpiCard label="Pending" value={pending.length} color="#EF9F27" icon="📙" />
        <KpiCard label="Collection Rate" value={`${totalDue > 0 ? ((totalCollected / totalDue) * 100).toFixed(1) : 0}%`} color="#7F77DD" icon="↗" />
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <select
          value={filterCustomer}
          onChange={e => setFilterCustomer(e.target.value)}
          style={{ border: "1px solid #D3D1C7", borderRadius: 8, padding: "9px 14px", fontSize: 13, background: "#fff", minWidth: 220 }}
        >
          <option value="">All customers ({payments.length} records)</option>
          {customers.map(c => (
            <option key={c.id} value={String(c.id)}>
              {c.name} — {payments.filter(p => p.customer_id === c.id).length} payments
            </option>
          ))}
        </select>
        {filterCustomer && (
          <button onClick={() => setFilterCustomer("")} style={{ background: "#F1EFE8", border: "none", borderRadius: 8, padding: "9px 14px", fontSize: 13, cursor: "pointer", color: "#444" }}>
            ✕ Clear filter
          </button>
        )}
        <span style={{ fontSize: 13, color: "#888" }}>Showing {shownPayments.length} records</span>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
        {loading ? <Loading /> : (
          <Table headers={["Customer", "#", "Amount Due", "Amount Paid", "Balance", "Due Date", "Status", "Actions"]}>
            {shownPayments.length === 0
              ? <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#888" }}>
                  No payment records yet. Click &quot;+ Record Payment&quot; to add one.
                </td></tr>
              : shownPayments.map((p, i) => (
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
                    {(p.status === "pending" || p.status === "partial") && (
                      <div style={{ display: "flex", gap: 6 }}>
                        <Btn small onClick={() => markPaid(p)}>✓ Paid</Btn>
                        {/* FIX: replaced <Btn small variant="danger"> with plain styled button */}
                        <button
                          onClick={() => markMissed(p)}
                          style={{ background: "#FEE2E2", color: "#E24B4A", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
                          ✕ Missed
                        </button>
                      </div>
                    )}
                    {p.status === "missed" && (
                      <Btn small onClick={() => markPaid(p)}>↩ Mark Paid</Btn>
                    )}
                  </td>
                </Tr>
              ))}
          </Table>
        )}
      </div>

      {showModal && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}>
          <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}>
            <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 6, color: "#1a1a1a" }}>Record Payment Installment</h3>
            <p style={{ fontSize: 13, color: "#888", marginBottom: 20 }}>Risk score updates automatically after saving.</p>

            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Customer *</label>
                <div ref={dropdownRef} style={{ position: "relative" }}>
                  <input
                    style={{ ...inp, borderColor: selectedCustomer ? "#1D9E75" : "#D3D1C7" }}
                    placeholder="Type name or phone to search..."
                    value={selectedCustomer ? `${selectedCustomer.name} — ${selectedCustomer.phone}` : customerSearch}
                    onChange={e => {
                      setCustomerSearch(e.target.value);
                      setSelectedCustomer(null);
                      setShowDropdown(true);
                    }}
                    onFocus={() => setShowDropdown(true)}
                  />
                  {selectedCustomer && (
                    <button
                      onClick={() => { setSelectedCustomer(null); setCustomerSearch(""); setShowDropdown(true); }}
                      style={{ position: "absolute", right: 10, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "#888", fontSize: 16 }}
                    >✕</button>
                  )}
                  {showDropdown && !selectedCustomer && customerSearch.length > 0 && (
                    <div style={{ position: "absolute", top: "100%", left: 0, right: 0, background: "#fff", border: "1px solid #D3D1C7", borderRadius: 8, boxShadow: "0 4px 20px rgba(0,0,0,0.12)", zIndex: 100, maxHeight: 220, overflowY: "auto" }}>
                      {filteredCustomers.length === 0
                        ? <div style={{ padding: "12px 14px", color: "#888", fontSize: 13 }}>No customers found</div>
                        : filteredCustomers.map(c => (
                          <div
                            key={c.id}
                            onClick={() => { setSelectedCustomer(c); setShowDropdown(false); setCustomerSearch(""); }}
                            style={{ padding: "10px 14px", cursor: "pointer", borderBottom: "1px solid #F0EDE6", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                            onMouseEnter={e => (e.currentTarget.style.background = "#F5F3EE")}
                            onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                          >
                            <div>
                              <div style={{ fontSize: 13, fontWeight: 500, color: "#1a1a1a" }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: "#888" }}>{c.phone} · {c.region}</div>
                            </div>
                            <span style={{ fontSize: 11, background: c.risk_level === "high" ? "#FCEBEB" : c.risk_level === "medium" ? "#FAEEDA" : "#E1F5EE", color: c.risk_level === "high" ? "#A32D2D" : c.risk_level === "medium" ? "#BA7517" : "#0F6E56", padding: "2px 8px", borderRadius: 20, fontWeight: 500 }}>
                              {c.risk_level}
                            </span>
                          </div>
                        ))
                      }
                    </div>
                  )}
                </div>
                {selectedCustomer && (
                  <div style={{ marginTop: 8, background: "#E1F5EE", borderRadius: 8, padding: "8px 12px", display: "flex", gap: 12, fontSize: 12 }}>
                    <span style={{ color: "#0F6E56", fontWeight: 500 }}>✓ Selected:</span>
                    <span style={{ color: "#1a1a1a" }}>{selectedCustomer.name}</span>
                    <span style={{ color: "#888" }}>{selectedCustomer.product_type}</span>
                    <span style={{ color: "#888", textTransform: "capitalize" }}>{selectedCustomer.payment_plan} plan</span>
                  </div>
                )}
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Amount Due (RWF) *</label>
                  <input style={inp} type="number" placeholder="e.g. 5000" value={amountDue} onChange={e => setAmountDue(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Amount Paid (RWF)</label>
                  <input style={inp} type="number" placeholder="0 if unpaid" value={amountPaid} onChange={e => setAmountPaid(e.target.value)} />
                </div>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Installment #</label>
                  <input style={inp} type="number" min="1" value={installmentNum} onChange={e => setInstallmentNum(e.target.value)} />
                </div>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#444", display: "block", marginBottom: 6 }}>Due Date</label>
                  <input style={inp} type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} />
                </div>
              </div>

              {amountDue && (
                <div style={{ background: "#F5F3EE", borderRadius: 8, padding: "10px 14px", fontSize: 13 }}>
                  <span style={{ color: "#666" }}>Status will be: </span>
                  <strong style={{ color: +amountPaid >= +amountDue ? "#1D9E75" : +amountPaid > 0 ? "#7F77DD" : "#EF9F27" }}>
                    {+amountPaid >= +amountDue ? "✓ Paid" : +amountPaid > 0 ? "◑ Partial" : "⏳ Pending"}
                  </strong>
                  {+amountDue > 0 && <span style={{ color: "#888", marginLeft: 8 }}>Balance: RWF {Math.max(0, +amountDue - (+amountPaid || 0)).toFixed(0)}</span>}
                </div>
              )}
            </div>

            <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 20 }}>
              {/* FIX: replaced <Btn variant="ghost"> with plain styled button */}
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                style={{ background: "#F0EDE6", color: "#666", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
                Cancel
              </button>
              <Btn onClick={handleCreate}>{saving ? "Saving..." : "Save & Update Risk"}</Btn>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
