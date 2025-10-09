import type { ReactNode } from "react";
import { NavLink, Outlet } from "react-router-dom";

const navLinks: Array<{ to: string; label: string }> = [
  { to: "/", label: "今日训练" },
  { to: "/week", label: "周计划" },
  { to: "/upload", label: "导入计划" }
];

interface Props {
  children?: ReactNode;
}

export function Layout({ children }: Props) {
  return (
    <div className="layout-shell">
      <main className="layout-content">{children ?? <Outlet />}</main>
      <nav className="layout-nav">
        {navLinks.map((link) => (
          <NavLink
            key={link.to}
            to={link.to}
            end={link.to === "/"}
            className={({ isActive }) => (isActive ? "nav-link active" : "nav-link")}
          >
            {link.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
