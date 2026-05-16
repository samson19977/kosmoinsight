"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { DashLayout } from "@/components/ui";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [user, loading, router]);

  if (loading || !user) return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "#1a1a2e" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 40, height: 40, background: "#7F77DD", borderRadius: 10, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff", margin: "0 auto 12px" }}>K</div>
        <p style={{ color: "#ccc", fontSize: 13 }}>Loading...</p>
      </div>
    </div>
  );

  return <DashLayout>{children}</DashLayout>;
}
