"use client";
import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("admin@kosmotive.rw");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handle = async (e: FormEvent) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      await login(email, password);
      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally { setLoading(false); }
  };

  const input = { width: "100%", border: "1px solid #D3D1C7", borderRadius: 8, padding: "10px 14px", fontSize: 14, outline: "none", background: "#fff" };

  return (
    <div style={{ minHeight: "100vh", background: "#1a1a2e", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}>
      <div style={{ background: "#fff", borderRadius: 18, padding: 40, width: "100%", maxWidth: 400, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
        {/* Logo */}
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ width: 52, height: 52, background: "#7F77DD", borderRadius: 14, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 26, fontWeight: 700, color: "#fff", margin: "0 auto 12px" }}>K</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: "#1a1a1a", marginBottom: 4 }}>KosmoInsight AI</h1>
          <p style={{ fontSize: 14, color: "#888" }}>Smart Health & PayGo Analytics</p>
        </div>

        <form onSubmit={handle} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6 }}>Email</label>
            <input style={input} type="email" value={email} onChange={e => setEmail(e.target.value)} required />
          </div>
          <div>
            <label style={{ fontSize: 13, fontWeight: 500, color: "#444", display: "block", marginBottom: 6 }}>Password</label>
            <input style={input} type="password" value={password} onChange={e => setPassword(e.target.value)} required />
          </div>

          {error && <div style={{ background: "#FCEBEB", border: "1px solid #E24B4A", borderRadius: 8, padding: "10px 14px", color: "#A32D2D", fontSize: 13 }}>{error}</div>}

          <button type="submit" disabled={loading} style={{ background: "#7F77DD", color: "#fff", border: "none", borderRadius: 8, padding: "12px", fontSize: 15, fontWeight: 600, cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.8 : 1, marginTop: 4 }}>
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <div style={{ marginTop: 24, background: "#F5F3EE", borderRadius: 10, padding: 14 }}>
          <p style={{ fontSize: 12, color: "#888", marginBottom: 8, fontWeight: 600 }}>Demo credentials:</p>
          {[["admin@kosmotive.rw", "admin123", "Admin"], ["grace@kosmotive.rw", "staff123", "Staff"], ["eric@kosmotive.rw", "analyst123", "Analyst"]].map(([e, p, r]) => (
            <button key={e} onClick={() => { setEmail(e); setPassword(p); }} style={{ display: "block", width: "100%", textAlign: "left", background: "none", border: "none", padding: "4px 0", cursor: "pointer", fontSize: 12, color: "#7F77DD" }}>
              {r}: {e} / {p}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
