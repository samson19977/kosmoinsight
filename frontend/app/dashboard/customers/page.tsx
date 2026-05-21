"use client";

import { useEffect, useState, FormEvent } from "react";
import { api, Customer } from "@/lib/api";
import {
  PageHeader,
  Btn,
  Table,
  Tr,
  Td,
  RiskBadge,
  StatusBadge,
  Loading,
  InsightCard
} from "@/components/ui";

const REGIONS = ["Kigali", "Northern", "Southern", "Eastern", "Western"];
const PRODUCTS = [
  "Menstrual Cup",
  "Reusable Pads Kit",
  "Maternal Health Kit",
  "Solar Lamp",
  "Clean Cookstove"
];
const PLANS = ["weekly", "biweekly", "monthly"];

/* ---------------- MODAL ---------------- */
function Modal({
  onClose,
  onSave,
  initial
}: {
  onClose: () => void;
  onSave: (d: Partial<Customer>) => Promise<void>;
  initial?: Partial<Customer>;
}) {
  const [form, setForm] = useState<any>({
    name: "",
    phone: "",
    location: "",
    region: "Kigali",
    product_type: "Menstrual Cup",
    payment_plan: "monthly",
    notes: "",
    ...initial
  });

  const [loading, setLoading] = useState(false);

  const inp = {
    width: "100%",
    border: "1px solid #D3D1C7",
    borderRadius: 8,
    padding: "8px 12px",
    fontSize: 13,
    outline: "none"
  };

  const set =
    (k: string) =>
    (
      e: React.ChangeEvent<
        HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement
      >
    ) =>
      setForm((f: any) => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onSave(form);
      onClose();
    } finally {
      setLoading(false);
    }
  };

  const fields: [string, string, string][] = [
    ["name", "Full Name *", "text"],
    ["phone", "Phone *", "text"],
    ["location", "Location", "text"]
  ];

  const selects: [string, string, string[]][] = [
    ["region", "Region", REGIONS],
    ["product_type", "Product Type", PRODUCTS],
    ["payment_plan", "Payment Plan", PLANS]
  ];

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 16,
          padding: 28,
          width: "100%",
          maxWidth: 480
        }}
      >
        <h3 style={{ fontSize: 17, fontWeight: 700, marginBottom: 20 }}>
          {initial?.id ? "Edit Customer" : "Add New Customer"}
        </h3>

        <form
          onSubmit={submit}
          style={{ display: "flex", flexDirection: "column", gap: 14 }}
        >
          {fields.map(([k, label, type]) => (
            <div key={k}>
              <label style={{ fontSize: 12, marginBottom: 5, display: "block" }}>
                {label}
              </label>
              <input
                style={inp}
                type={type}
                value={(form as any)[k] || ""}
                onChange={set(k)}
                required={label.includes("*")}
              />
            </div>
          ))}

          {selects.map(([k, label, opts]) => (
            <div key={k}>
              <label style={{ fontSize: 12, marginBottom: 5, display: "block" }}>
                {label}
              </label>
              <select style={inp} value={(form as any)[k]} onChange={set(k)}>
                {opts.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          ))}

          <div>
            <label style={{ fontSize: 12, marginBottom: 5, display: "block" }}>
              Notes
            </label>
            <textarea
              style={{ ...inp, minHeight: 70 }}
              value={form.notes}
              onChange={set("notes")}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="ghost" onClick={onClose}>
              Cancel
            </Btn>

            <Btn type="submit">
              {loading ? "Saving..." : "Save Customer"}
            </Btn>
          </div>
        </form>
      </div>
    </div>
  );
}

/* ---------------- DETAIL ---------------- */

function CustomerDetail({
  customer,
  onClose,
  onRefresh
}: {
  customer: Customer;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const [payments, setPayments] = useState<any[]>([]);
  const [risk, setRisk] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    api.customers
      .payments(customer.id)
      .then((d: any) => setPayments(d.payments || []));
  }, [customer.id]);

  const runRisk = async () => {
    setLoading(true);

    const missed = payments.filter((p) => p.status === "missed").length;

    const data = await api.predict.risk({
      customer_id: customer.id,
      missed_payments: missed,
      total_payments: payments.length || 1,
      months_active: 1
    });

    setRisk(data);
    setLoading(false);
    onRefresh();
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.4)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center"
      }}
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div style={{ background: "#fff", padding: 28, borderRadius: 16, width: 640 }}>
        <h3>{customer.name}</h3>

        <Btn small onClick={runRisk}>
          {loading ? "Running..." : "Run Prediction"}
        </Btn>

        <div style={{ marginTop: 20 }}>
          {risk && (
            <InsightCard type="info" message={risk.recommendation} />
          )}
        </div>

        <Btn variant="ghost" onClick={onClose}>
          Close
        </Btn>
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
      if (["active", "completed", "suspended", "defaulted"].includes(filter)) {
        params.status = filter;
      } else {
        params.risk_level = filter;
      }
    }

    api.customers
      .list(params)
      .then((d) => setCustomers(d as Customer[]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, [search, filter]);

  return (
    <div>
      <PageHeader
        title="Customer Management"
        sub={`${customers.length} customers`}
        action={<Btn onClick={() => setShowModal(true)}>+ Add Customer</Btn>}
      />

      <div style={{ display: "flex", gap: 12 }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search..."
        />

        <select value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">All</option>
          <option value="active">Active</option>
          <option value="high">High Risk</option>
          <option value="medium">Medium Risk</option>
          <option value="low">Low Risk</option>
        </select>
      </div>

      {loading ? (
        <Loading />
      ) : (
        <Table headers={["Name", "Phone", "Region", "Risk", ""]}>
          {customers.map((c) => (
            <Tr key={c.id}>
              <Td>{c.name}</Td>
              <Td>{c.phone}</Td>
              <Td>{c.region}</Td>
              <Td>
                <RiskBadge level={c.risk_level} />
              </Td>
              <Td>
                <Btn small onClick={() => setSelected(c)}>
                  View
                </Btn>
              </Td>
            </Tr>
          ))}
        </Table>
      )}

      {showModal && (
        <Modal onClose={() => setShowModal(false)} onSave={async () => {}} />
      )}

      {selected && (
        <CustomerDetail
          customer={selected}
          onClose={() => setSelected(null)}
          onRefresh={load}
        />
      )}
    </div>
  );
}
