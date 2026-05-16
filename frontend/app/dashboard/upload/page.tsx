"use client";
import { useState, useRef } from "react";
import { PageHeader, Card, Btn, InsightCard } from "@/components/ui";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface UploadResult { message: string; rows_imported: number; errors: number; preview?: Record<string, string>[] }

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    if (!file) return;
    setLoading(true); setError(""); setResult(null);
    const fd = new FormData();
    fd.append("file", file);
    try {
      const token = localStorage.getItem("kosmo_token");
      const res = await fetch(`${API}/api/uploads/customers`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Upload failed");
      setResult(data as UploadResult);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally { setLoading(false); }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PageHeader title="Data Upload" sub="Import customers from CSV or Excel files" />

      <Card title="📤 Upload Customer Data">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ background: "#F5F3EE", border: "2px dashed #D3D1C7", borderRadius: 12, padding: "32px 24px", textAlign: "center", cursor: "pointer" }}
            onClick={() => ref.current?.click()}>
            <input ref={ref} type="file" accept=".csv,.xlsx,.xls" onChange={e => setFile(e.target.files?.[0] || null)} style={{ display: "none" }} />
            <div style={{ fontSize: 32, marginBottom: 8 }}>📂</div>
            {file ? (
              <div>
                <p style={{ fontWeight: 600, color: "#1a1a1a", marginBottom: 4 }}>{file.name}</p>
                <p style={{ fontSize: 13, color: "#888" }}>{(file.size / 1024).toFixed(1)} KB</p>
              </div>
            ) : (
              <div>
                <p style={{ fontWeight: 600, color: "#444", marginBottom: 4 }}>Click to choose file</p>
                <p style={{ fontSize: 13, color: "#888" }}>CSV or Excel (.csv, .xlsx, .xls)</p>
              </div>
            )}
          </div>

          {file && <Btn onClick={handleUpload}>{loading ? "Uploading..." : "Upload & Import"}</Btn>}

          {error && <InsightCard type="warning" message={`Upload error: ${error}`} />}
          {result && (
            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
              <InsightCard type="success" message={`${result.message} — ${result.rows_imported} customers imported${result.errors > 0 ? `, ${result.errors} rows had errors` : ""}.`} />
              {result.preview && result.preview.length > 0 && (
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: "#444", marginBottom: 8 }}>Preview (first 5 rows):</p>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr style={{ background: "#FAFAF8" }}>
                        {Object.keys(result.preview[0]).map(k => <th key={k} style={{ padding: "8px 10px", textAlign: "left", fontWeight: 600, color: "#888", borderBottom: "1px solid #E8E6E0" }}>{k}</th>)}
                      </tr></thead>
                      <tbody>{result.preview.map((row, i) => (
                        <tr key={i} style={{ borderBottom: "1px solid #F0EDE6" }}>
                          {Object.values(row).map((v, j) => <td key={j} style={{ padding: "8px 10px", color: "#555" }}>{String(v)}</td>)}
                        </tr>
                      ))}</tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </Card>

      <Card title="📋 CSV Format Guide">
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <InsightCard type="info" message="Required columns: name, phone — All other columns are optional." />
          <div style={{ background: "#1a1a2e", borderRadius: 10, padding: 16, overflowX: "auto" }}>
            <pre style={{ color: "#a89dff", fontSize: 12, margin: 0, fontFamily: "monospace" }}>
{`name,phone,location,region,product_type,payment_plan
Amina Uwimana,0782341234,Kigali City,Kigali,Menstrual Cup,monthly
Celestine Mukamana,0793456789,Musanze,Northern,Maternal Health Kit,weekly
Diane Ingabire,0721234567,Huye,Southern,Solar Lamp,monthly`}
            </pre>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            {[["name", "Full name of customer (required)"], ["phone", "Phone number (required)"], ["location", "District or area"], ["region", "Kigali / Northern / Southern / Eastern / Western"], ["product_type", "Menstrual Cup, Solar Lamp, etc."], ["payment_plan", "weekly / biweekly / monthly"]].map(([col, desc]) => (
              <div key={col} style={{ background: "#FAFAF8", borderRadius: 8, padding: "10px 12px" }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: "#7F77DD", marginBottom: 2, fontFamily: "monospace" }}>{col}</p>
                <p style={{ fontSize: 12, color: "#666" }}>{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </Card>
    </div>
  );
}
