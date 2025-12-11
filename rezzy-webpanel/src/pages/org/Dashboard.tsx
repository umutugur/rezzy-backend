import React from "react";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore, MeUser } from "../../store/auth";
import { useNavigate } from "react-router-dom";

type OrgLite = {
  id: string;
  name: string;
  region?: string | null;
  role?: string;
};

function getUserOrganizations(u: MeUser | null): OrgLite[] {
  if (!u || !Array.isArray(u.organizations)) return [];

  return u.organizations
    .map((o: any) => {
      // Önce toClientUser’ın ürettiği shape’e bak
      const id =
        o.id ||
        o.organization?._id ||
        o.organizationId ||
        o.organization ||
        o._id ||
        null;

      if (!id) return null;

      return {
        id: String(id),
        // toClientUser -> name alanını zaten koyuyor
        name: o.name || o.organizationName || "İsimsiz Organizasyon",
        // Şu an backend region göndermiyor ama ileride eklersen buraya düşer
        region: o.region ?? null,
        role: o.role,
      };
    })
    .filter(Boolean) as OrgLite[];
}
function prettyOrgRole(role?: string) {
  if (!role) return "-";
  switch (role) {
    case "org_owner":
      return "Owner";
    case "org_admin":
      return "Admin";
    case "org_finance":
      return "Finans";
    case "org_staff":
      return "Staff";
    default:
      return role;
  }
}

export default function OrgDashboardPage() {
  const user = authStore.getUser();
  const orgs = getUserOrganizations(user);
  const nav = useNavigate();
  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/org", label: "Özet" },
          { to: "/org/branch-requests", label: "Şube Talepleri" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">Organizasyon Paneli</h2>

        <Card title="Bağlı Olduğunuz Organizasyonlar">
  {orgs.length === 0 ? (
    <div className="text-sm text-gray-500">
      Herhangi bir organizasyona bağlı değilsiniz.
    </div>
  ) : (
    <div className="overflow-auto">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="text-left text-gray-500">
            <th className="py-2 px-4">Ad</th>
            <th className="py-2 px-4">Bölge</th>
            <th className="py-2 px-4">Rolünüz</th>
            <th className="py-2 px-4 text-right">İşlemler</th> {/* ✅ yeni */}
          </tr>
        </thead>
        <tbody>
          {orgs.map((o) => {
            const orgId = o.id;// güvenli olsun
            return (
              <tr key={orgId} className="border-t">
                <td className="py-2 px-4">{o.name}</td>
                <td className="py-2 px-4">{o.region || "-"}</td>
                <td className="py-2 px-4">{prettyOrgRole(o.role)}</td>
                <td className="py-2 px-4 text-right">
                  {orgId && (
                    <button
                      className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-gray-100 hover:bg-gray-200"
                      onClick={() =>
                        nav(`/org/organizations/${orgId}/menu`)
                      }
                    >
                      Menüyü Yönet
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  )}
  <p className="mt-3 text-xs text-gray-500">
    Yeni şube açma ihtiyaçlarınızı{" "}
    <a
      href="/org/branch-requests"
      className="text-brand-700 underline"
    >
      Şube Talepleri
    </a>{" "}
    ekranından iletebilirsiniz.
  </p>
</Card>
      </div>
    </div>
  );
}