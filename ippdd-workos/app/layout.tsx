import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "IPPDD WorkOS", template: "%s — IPPDD WorkOS" },
  description:
    "OKR, Work, Evidence, Approval & Governance Execution System — Netcapital Financial Group",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="mn" className="h-full antialiased">
      <body className="min-h-full bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
