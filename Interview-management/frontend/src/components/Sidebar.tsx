import { Link, useLocation } from "react-router-dom";
import type { Role } from "../types/auth";

const pages = [
  { to: "/", label: "Dashboard", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
  { to: "/calendar", label: "Interview Calendar", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
  { to: "/interviews", label: "Interviews", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
  { to: "/candidates", label: "Candidate List", roles: ["Administrator", "Manager", "TA"] as Role[] },
  { to: "/candidates/new", label: "Add Candidate", roles: ["Administrator", "Manager", "TA"] as Role[] },
  { to: "/requisitions", label: "Requisition List", roles: ["Administrator", "Manager", "TA"] as Role[] },
  { to: "/requisitions/new", label: "Add Requisition", roles: ["Administrator", "Manager", "TA"] as Role[] },
  { to: "/panels", label: "Panel Management", roles: ["Administrator", "Manager", "TA"] as Role[] },
  { to: "/my-schedule", label: "My Schedule", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
  { to: "/my-availability", label: "My Availability", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
  { to: "/pending-feedback", label: "Pending Feedback", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
  { to: "/reports", label: "Reports", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
  { to: "/users", label: "User Management", roles: ["Administrator"] as Role[] },
  { to: "/settings", label: "Settings", roles: ["Administrator"] as Role[] },
  { to: "/audit", label: "Audit Log", roles: ["Administrator", "Manager", "TA", "Panel"] as Role[] },
];

export function Sidebar({ groups }: { groups: Role[] }) {
  const location = useLocation();
  return (
    <aside className="w-64 min-h-screen bg-slate-950 p-4 text-sky-100">
      <h1 className="mb-4 text-lg font-semibold text-sky-300">Interview Manager</h1>
      <nav className="space-y-1">
        {pages
          .filter((page) => page.roles.some((role) => groups.includes(role)))
          .map((page) => (
            <Link
              key={page.to}
              to={page.to}
              className={`block rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-sky-300 ${
                location.pathname === page.to ? "bg-sky-800 text-white" : "hover:bg-slate-800"
              }`}
            >
              {page.label}
            </Link>
          ))}
      </nav>
    </aside>
  );
}
