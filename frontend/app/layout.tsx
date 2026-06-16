import type { Metadata } from "next";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { WakeBackend } from "@/components/wake-backend";

export const metadata: Metadata = {
  title: "KosmoInsight AI",
  description: "Smart Health & PayGo Analytics Platform",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <AuthProvider>{children}</AuthProvider>
        <WakeBackend />
      </body>
    </html>
  );
}
