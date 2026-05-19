"use client";
import { useState, FormEvent, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { pingBackend } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@kosmotive.rw");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [serverReady, setServerReady] = useState(false);

  useEffect(() => {
    // Wake Render backend immediately — fixes 30-60s cold start
    pingBackend();
    const t = setTimeout(() => setServerReady(true), 5000);
    return () => clearTimeout(t);
  }, []);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed. If this is your first login today, wait 30 seconds and try again.");
    } finally { setLoading(false); }
  };

  const inp = { width: "100%", border: "1px solid #D3D1C7", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", background: "#fff" };

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 40, width: "100%", maxWidth: 420, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <div style={{ width: 52, height: 52, background: "#7F77DD", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 auto 12px" }}>K</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>KosmoInsight AI</h1>
          <p style={{ fontSize: 14, color: "#888" }}>Smart Health & PayGo Analytics</p>
        </div>

        {!serverReady && (
          <div style={{ background: "#EEEDFE", border: "1px solid #7F77DD", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#534AB7", display: "flex", alignItems: "center", gap: 8 }}>
            <span>⏳</span>
            <span>Waking up server... first login may take up to 30 seconds.</span>
          </div>
        )}

        <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6 }}>Email</label>
            <input style={inp} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6 }}>Password</label>
            <input style={inp} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>
          {error && <div style={{ background: "#FCEBEB", border: "1px solid #E24B4A", borderRadius: 8, padding: "10px 14px", color: "#A32D2D", fontSize: 13 }}>{error}</div>}
          <button type="submit" disabled={loading} style={{ background: "#7F77DD", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.8 : 1, marginTop: 4 }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 20, background: "#F5F3EE", borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 12, color: "#666", marginBottom: 10, fontWeight: 700 }}>Demo accounts — click to fill:</p>
          {[
            ["admin@kosmotive.rw", "admin123", "Admin", "#7F77DD", "Full access — add, edit, delete everything"],
            ["grace@kosmotive.rw", "staff123", "Staff", "#1D9E75", "Add customers & payments — cannot delete"],
            ["eric@kosmotive.rw", "analyst123", "Analyst", "#185FA5", "View reports & charts only — read only"],
          ].map(([e, p, r, col, desc]) => (
            <button key={e} onClick={() => { setEmail(e); setPassword(p); }}
              style={{ display: "flex", width: "100%", textAlign: "left", background: "none", border: `1px solid ${col}30`, borderRadius: 6, padding: "7px 10px", cursor: "pointer", marginBottom: 6, alignItems: "center", gap: 8 }}>
              <span style={{ background: col, color: "#fff", borderRadius: 4, padding: "1px 7px", fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{r}</span>
              <div>
                <div style={{ fontSize: 12, color: "#444" }}>{e}</div>
                <div style={{ fontSize: 11, color: "#999" }}>{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
