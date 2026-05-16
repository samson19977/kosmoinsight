"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";

export default function Home() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading) {
      router.replace(user ? "/dashboard" : "/login");
    }
  }, [user, loading, router]);
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#1a1a2e" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, background: "#7F77DD", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 24, margin: "0 auto 16px" }}>K</div>
        <p style={{ color: "#ccc", fontSize: 14 }}>Loading KosmoInsight AI...</p>
      </div>
    </div>
  );
}
