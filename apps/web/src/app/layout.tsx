import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "cFlow AI",
  description: "半导体设计流程管理 AI 系统",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full">
      <body className="h-full">{children}</body>
    </html>
  );
}
