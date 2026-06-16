"use client";
import { useEffect, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export function WakeBackend() {
  const [status, setStatus] = useState<"waking" | "ready" | "hidden">("hidden");

  useEffect(() => {
    let attempts = 0;
    const maxAttempts = 10; // 10 × 3s = 30s max wait

    const ping = async () => {
      try {
        const res = await fetch(`${API}/api/health`, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          setStatus("ready");
          // Hide the banner after 2 seconds
          setTimeout(() => setStatus("hidden"), 2000);
          return;
        }
      } catch {
        // still waking
      }
      attempts++;
      if (attempts < maxAttempts) {
        setStatus("waking");
        setTimeout(ping, 3000);
      } else {
        setStatus("hidden"); // give up silently
      }
    };

    // Only show banner + ping if backend is actually sleeping
    fetch(`${API}/api/health`, { signal: AbortSignal.timeout(3000) })
      .then(r => { if (!r.ok) throw new Error(); })
      .catch(() => {
        setStatus("waking");
        setTimeout(ping, 3000);
      });
  }, []);

  if (status === "hidden") return null;

  return (
    <div style={{
      position: "fixed", bottom: 20, right: 20, zIndex: 9999,
      background: status === "ready" ? "#ECFDF5" : "#FFFBEB",
      border: `1px solid ${status === "ready" ? "#6EE7B7" : "#FCD34D"}`,
      borderRadius: 12, padding: "12px 18px",
      display: "flex", alignItems: "center", gap: 10,
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)", fontSize: 13,
      color: status === "ready" ? "#065F46" : "#92400E",
      maxWidth: 300,
    }}>
      {status === "waking" ? (
        <>
          <span style={{ fontSize: 18 }}>⏳</span>
          <div>
            <strong>Waking up server…</strong>
            <p style={{ margin: 0, fontSize: 12, opacity: 0.8 }}>
              Free tier sleeps after inactivity. Ready in ~30s.
            </p>
          </div>
        </>
      ) : (
        <>
          <span style={{ fontSize: 18 }}>✅</span>
          <strong>Server is ready!</strong>
        </>
      )}
    </div>
  );
}
