import type { Metadata } from "next";
import { APP_CONFIG } from "@/lib/config";
import "./globals.css";

export const metadata: Metadata = {
  title: APP_CONFIG.displayName,
  description: "AI-Powered Code Review, Debugging, and Explanation IDE",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark h-full bg-[#0b0e1a] text-[#e4e9f7]">
      <body className="h-full overflow-hidden select-none">{children}</body>
    </html>
  );
}
