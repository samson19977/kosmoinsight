"use client";
import { useEffect, useState, FormEvent } from "react";
import { api, Customer } from "@/lib/api";
import { PageHeader, Btn, Table, Tr, Td, RiskBadge, StatusBadge, Loading, InsightCard } from "@/components/ui";

const REGIONS = ["Kigali", "Northern", "Southern", "Eastern", "Western"];
const PRODUCTS = ["Menstrual Cup", "Reusable Pads Kit", "Maternal Health Kit", "Solar Lamp", "Clean Cookstove"];
const PLANS = ["weekly", "biweekly", "monthly"];

/* ---------------- MODAL ---------------- */
function Modal({ onClose, onSave, initial }: {
  onClose: () => void;
  onSave: (d: Partial<Customer>) => Promise<void>;
  initial?: Partial<Customer>;
}) {
  const [form, setForm] = useState({
    name: "", phone: "", location: "", region: "Kigali",
    product_type: "Menstrual Cup", payment_plan: "monthly", notes: "",
    ...initial
  });
  const [loading, setLoading] = useState(false);

  const inp = { width: "100%", border: "1px solid #D3D1C7", borderRadius: 8, padding: "8px 12px", fontSize: 13, outline: "none" };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try { await onSave(form); onClose(); } catch { setLoading(false); }
  };

  // Typed tuples â€” fixes "Type 'string | string[]' is not assignable to type 'Key'" error
  const fields: [string, string, string][] = [
    ["name", "Full Name *", "text"],
    ["phone", "Phone *", "text"],
    ["location", "Location", "text"],
  ];

  const selects: [string, string, string[]][] = [
    ["region", "Region", REGIONS],
    ["product_type", "Product Type", PRODUCTS],
    ["payment_plan", "Payment Plan", PLANS],
  ];

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, maxHeight: "90vh", overflowY: "auto" }}>
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20, color: "#1a1a1a" }}>
          {initial?.id ? "Edit Customer" : "Add New Customer"}
        </h3>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14 }}>

          {fields.map(([k, label, type]) => (
            <div key={k}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#666", display: "block", marginBottom: 5 }}>{label}</label>
              <input style={inp} type={type} value={String((form as Record<string, unknown>)[k] ?? "")} onChange={set(k)} required={label.includes("*")} />
            </div>
          ))}

          {selects.map(([k, label, opts]) => (
            <div key={k}>
              <label style={{ fontSize: 12, fontWeight: 500, color: "#666", display: "block", marginBottom: 5 }}>{label}</label>
              <select style={inp} value={(form as Record<string, unknown>)[k]} onChange={set(k)}>
                {opts.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, fontWeight: 500, color: "#666", display: "block", marginBottom: 5 }}>Notes</label>
            <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={(form as Record<string, unknown>).notes || ""} onChange={set("notes")} />
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 6 }}>
            <Btn variant="ghost" onClick={onClose}>Cancel</Btn>
            <Btn type="submit" onClick={() => {}}>{loading ? "Saving..." : "Save Customer"}</Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- DETAIL ---------------- */
function CustomerDetail({ customer, onClose, onRefresh }: {
  customer: Customer;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [payments, setPayments] = useState<Array<{ installment_number: number; amount_due: number; amount_paid: number; remaining_balance: number; status: string }>>([]);
  const [risk, setRisk] = useState<{ risk_score: number; risk_level: string; recommendation: string } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.customers.payments(customer.id)
      .then((d: unknown) => {
        const data = d as { payments: typeof payments };
        setPayments(data.payments || []);
      })
      .catch(() => {});
  }, [customer.id]);

  const runRisk = async () => {
    setLoading(true);
    const missed = payments.filter(p => p.status === "missed").length;
    const monthsActive = Math.max(1, Math.floor((Date.now() - new Date(customer.join_date).getTime()) / 86400000 / 30));

    // Uses api.predict.batchRisk to update all customers, then re-fetch this customer
    await api.predict.batchRisk();
    const updated = await api.customers.get(customer.id);
    setRisk({
      risk_score: updated.risk_score,
      risk_level: updated.risk_level,
      recommendation: updated.risk_level === "high"
        ? `High repayment risk detected (${missed} missed of ${payments.length}). Consider immediate follow-up contact.`
        : updated.risk_level === "medium"
        ? `Medium risk after ${monthsActive} month(s) active. Monitor payment consistency closely.`
        : "Low risk profile. Customer is maintaining good repayment habits.",
    });
    setLoading(false);
    onRefresh();
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }}
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div style={{ background: "#fff", borderRadius: 16, padding: 28, width: "100%", maxWidth: 640, maxHeight: "90vh", overflowY: "auto" }}>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
          <div>
            <h3 style={{ fontSize: 18, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>{customer.name}</h3>
            <p style={{ fontSize: 13, color: "#888" }}>{customer.phone} Â· {customer.region}</p>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <StatusBadge status={customer.status} />
            <RiskBadge level={customer.risk_level} />
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          {([["Product", customer.product_type || "â€”"], ["Plan", customer.payment_plan || "â€”"], ["Location", customer.location || "â€”"], ["Risk Score", `${(customer.risk_score * 100).toFixed(0)}%`]] as [string, string][]).map(([l, v]) => (
            <div key={l} style={{ background: "#FAFAF8", borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ fontSize: 11, color: "#888", fontWeight: 500, marginBottom: 4 }}>{l}</p>
              <p style={{ fontSize: 15, fontWeight: 600, color: "#1a1a1a", textTransform: "capitalize" }}>{v}</p>
            </div>
          ))}
        </div>

        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <h4 style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a" }}>ðŸ¤– AI Risk Analysis</h4>
            <Btn small onClick={runRisk}>{loading ? "Running..." : "Run Prediction"}</Btn>
          </div>
          {risk && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <div style={{ display: "flex", gap: 10 }}>
                {([["Risk Score", `${(risk.risk_score * 100).toFixed(0)}%`, "#EEEDFE", "#3C3489"], ["Risk Level", risk.risk_level, "#FAEEDA", "#633806"], ["Confidence", "85%", "#E1F5EE", "#085041"]] as [string, string, string, string][]).map(([l, v, bg, c]) => (
                  <div key={l} style={{ flex: 1, background: bg, borderRadius: 10, padding: "12px 14px", textAlign: "center" }}>
                    <p style={{ fontSize: 11, color: c, fontWeight: 500, marginBottom: 4 }}>{l}</p>
                    <p style={{ fontSize: 22, fontWeight: 700, color: c, textTransform: "capitalize" }}>{v}</p>
                  </div>
                ))}
              </div>
              <InsightCard
                type={risk.risk_level === "high" ? "warning" : risk.risk_level === "medium" ? "info" : "success"}
                message={risk.recommendation}
              />
            </div>
          )}
        </div>

        <h4 style={{ fontSize: 14, fontWeight: 600, color: "#1a1a1a", marginBottom: 10 }}>
          Payment History ({payments.length} installments)
        </h4>
        {payments.length === 0
          ? <p style={{ fontSize: 13, color: "#888" }}>No payment records yet.</p>
          : (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ background: "#FAFAF8" }}>
                  {["#", "Due", "Paid", "Balance", "Status"].map(h => (
                    <th key={h} style={{ padding: "8px 10px", textAlign: "left", fontSize: 12, fontWeight: 600, color: "#888" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {payments.map((p, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #F0EDE6" }}>
                    <td style={{ padding: "8px 10px", color: "#888" }}>{p.installment_number || i + 1}</td>
                    <td style={{ padding: "8px 10px" }}>RWF {p.amount_due?.toFixed(0)}</td>
                    <td style={{ padding: "8px 10px" }}>RWF {p.amount_paid?.toFixed(0)}</td>
                    <td style={{ padding: "8px 10px", color: (p.remaining_balance || 0) > 0 ? "#E24B4A" : "#1D9E75" }}>
                      RWF {(p.remaining_balance || 0).toFixed(0)}
                    </td>
                    <td style={{ padding: "8px 10px" }}><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

        <div style={{ marginTop: 20, textAlign: "right" }}>
          <Btn variant="ghost" onClick={onClose}>Close</Btn>
        </div>
      </div>
    </div>
  );
}

/* ---------------- PAGE ---------------- */
export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("");
  const [showModal, setShowModal] = useState(false);
  const [selected, setSelected] = useState<Customer | null>(null);

  const load = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (search) params.search = search;
    if (filter) {
      if (["active", "completed", "suspended", "defaulted"].includes(filter)) params.status = filter;
      else params.risk_level = filter;
    }
    api.customers.list(params)
      .then(d => { setCustomers(d as Customer[]); setLoading(false); })
      .catch(() => setLoading(false));
  };

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [search, filter]);

  const handleCreate = async (d: Partial<Customer>) => { await api.customers.create(d); load(); };
  const handleDelete = async (id: number) => { if (confirm("Delete this customer?")) { await api.customers.delete(id); load(); } };

  return (
    <div>
      <PageHeader
        title="Customer Management"
        sub={`${customers.length} customers`}
        action={<Btn onClick={() => setShowModal(true)}>+ Add Customer</Btn>}
      />

      <div style={{ display: "flex", gap: 12, marginBottom: 20, flexWrap: "wrap" }}>
        <input
          placeholder="Search name, phone, region..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 200, border: "1px solid #D3D1C7", borderRadius: 8, padding: "9px 14px", fontSize: 14, outline: "none" }}
        />
        <select value={filter} onChange={e => setFilter(e.target.value)}
          style={{ border: "1px solid #D3D1C7", borderRadius: 8, padding: "9px 14px", fontSize: 14, background: "#fff", cursor: "pointer" }}>
          <option value="">All customers</option>
          <option value="active">Active</option>
          <option value="completed">Completed</option>
          <option value="suspended">Suspended</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
        </select>
      </div>

      <div style={{ background: "#fff", border: "1px solid #E8E6E0", borderRadius: 14, overflow: "hidden" }}>
        {loading ? <Loading /> : (
          <Table headers={["Name", "Phone", "Region", "Product", "Plan", "Status", "Risk", "Score", ""]}>
            {customers.length === 0
              ? <tr><td colSpan={9} style={{ padding: 40, textAlign: "center", color: "#888", fontSize: 14 }}>No customers found.</td></tr>
              : customers.map((c, i) => (
                <Tr key={c.id} i={i}>
                  <Td bold>{c.name}</Td>
                  <Td>{c.phone}</Td>
                  <Td>{c.region}</Td>
                  <Td>{c.product_type}</Td>
                  <Td>{c.payment_plan}</Td>
                  <td style={{ padding: "11px 14px" }}><StatusBadge status={c.status} /></td>
                  <td style={{ padding: "11px 14px" }}><RiskBadge level={c.risk_level} /></td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <div style={{ width: 44, height: 5, background: "#F0EDE6", borderRadius: 3, overflow: "hidden" }}>
                        <div style={{ width: `${c.risk_score * 100}%`, height: "100%", borderRadius: 3, background: c.risk_level === "high" ? "#E24B4A" : c.risk_level === "medium" ? "#EF9F27" : "#1D9E75" }} />
                      </div>
                      <span style={{ fontSize: 11, color: "#888" }}>{(c.risk_score * 100).toFixed(0)}%</span>
                    </div>
                  </td>
                  <td style={{ padding: "11px 14px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn small onClick={() => setSelected(c)}>View</Btn>
                      <Btn small variant="danger" onClick={() => handleDelete(c.id)}>Delete</Btn>
                    </div>
                  </td>
                </Tr>
              ))}
          </Table>
        )}
      </div>

      {showModal && <Modal onClose={() => setShowModal(false)} onSave={handleCreate} />}
      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} onRefresh={load} />}
    </div>
  );
}


