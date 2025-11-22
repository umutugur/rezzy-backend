import React from "react";
import { NavLink } from "react-router-dom";
import { authStore } from "../store/auth";

type Item = { to: string; label: string };

export default function Sidebar({ items }: { items: Item[] }) {
  const u = authStore.getUser();
  const finalItems = React.useMemo(() => {
    const base = [...items];
    if (u?.role === "restaurant") {
      // Menü yönetimi sekmesini otomatik ekle
      if (!base.find(it => it.to === "/panel/restaurant/menu")) {
        base.push({ to: "/panel/restaurant/menu", label: "Menu Yönetimi" });
      }
    }
    return base;
  }, [items, u]);
  return (
    <aside className="w-64 shrink-0">
      <div className="sticky top-4 bg-white rounded-2xl shadow-soft p-4">
        <div className="mb-3">
          <div className="text-sm text-gray-500">Aktif Rol</div>
          <div className="font-medium">{u?.name} • {u?.role}</div>
        </div>
        <nav className="space-y-1">
          {finalItems.map((it) => (
            <NavLink
              key={it.to}
              to={it.to}
              className={({ isActive }) =>
                "block px-3 py-2 rounded-lg text-sm " +
                (isActive ? "bg-brand-600 text-white" : "hover:bg-gray-100")
              }
            >
              {it.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </aside>
  );
}
