"use client";

import { LogOut } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";

export default function LogoutButton() {
  const pathname = usePathname();
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (pathname === "/login") {
    return null;
  }

  async function logout() {
    setIsSubmitting(true);
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.assign("/login");
  }

  return (
    <button type="button" className="auth-logout" onClick={logout} disabled={isSubmitting}>
      <LogOut size={16} />
      退出
    </button>
  );
}
