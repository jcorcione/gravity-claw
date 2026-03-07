import type { Metadata } from "next";
import { Suspense } from "react";
import "./globals.css";
import Sidebar from "../components/Sidebar";

export const metadata: Metadata = {
  title: "Mission Control — AgenticHQ",
  description: "Premium AI agent dashboard for Nexus / AgenticHQ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="app-layout">
          <Suspense fallback={
            <div style={{ width: "var(--sidebar-width)", background: "var(--bg-deepest)", borderRight: "1px solid var(--border)" }} />
          }>
            <Sidebar />
          </Suspense>
          <main className="main-content">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
