import type { Metadata } from "next";
import LogoutButton from "./LogoutButton";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workout Web Frontend",
  description: "Next.js training workspace for workout_web",
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
