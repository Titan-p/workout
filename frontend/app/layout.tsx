import type { Metadata, Viewport } from "next";
import LogoutButton from "./LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workout",
  description: "训练记录和休息倒计时控制台",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Workout",
  },
  icons: {
    apple: "/workout-icon.svg",
    icon: "/workout-icon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: "#07110e",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN">
      <body>
        <LogoutButton />
        {children}
      </body>
    </html>
  );
}
