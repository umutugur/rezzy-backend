import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore, MeUser } from "../../store/auth";
import {
  orgListBranchRequests,
  orgCreateBranchRequest,
  type OrgBranchRequest,
} from "../../api/client";
import { showToast } from "../../ui/Toast";

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
      const id =
        o.organization?._id ||
        o.organizationId ||
        o.organization ||
        o._id ||
        null;
      if (!id) return null;
      return {
        id: String(id),
        name: o.name || o.organizationName || "İsimsiz Organizasyon",
        region: o.region || null,
        role: o.role,
      };
    })
    .filter(Boolean) as OrgLite[];
}

const STATUS_LABEL: Record<string, string> = {
  pending: "Beklemede",
  approved: "Onaylandı",
  rejected: "Reddedildi",
};

export default function OrgBranchRequestsPage() {
  const qc = useQueryClient();
  const user = authStore.getUser();
  const orgs = getUserOrganizations(user);

  const [selectedOrgId, setSelectedOrgId] = React.useState<string>(
    orgs[0]?.id ?? ""
  );
  const [statusFilter, setStatusFilter] = React.useState<string>("");

  const [cursor, setCursor] = React.useState<string | undefined>(undefined);

  // Liste çekme
  const listQ = useQuery({
    queryKey: ["org-branch-requests", selectedOrgId, statusFilter, cursor],
    queryFn: () =>
      orgListBranchRequests({
        organizationId: selectedOrgId || undefined,
        status: statusFilter || undefined,
        cursor,
      }),
    enabled: !!user,
  });

  const items = listQ.data?.items ?? [];
  const nextCursor = listQ.data?.nextCursor;

  const fmtDate = (v?: string | null) => {
    if (!v) return "-";
    try {
      const d = new Date(v);
      return d.toLocaleString("tr-TR");
    } catch {
      return v;
    }
  };

  // ========================
  // Yeni talep formu state
  // ========================
  const [name, setName] = React.useState("");
  const [city, setCity] = React.useState("");
  const [region, setRegion] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [iban, setIban] = React.useState("");
  const [priceRange, setPriceRange] = React.useState("₺₺");
  const [businessType, setBusinessType] = React.useState("restaurant");
  const [description, setDescription] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const createMut = useMutation({
    mutationFn: () =>
      orgCreateBranchRequest({
        organizationId: selectedOrgId,
        name: name.trim(),
        region:
          region.trim() ||
          orgs.find((o) => o.id === selectedOrgId)?.region ||
          undefined,
        city: city.trim() || undefined,
        address: address.trim() || undefined,
        phone: phone.trim() || undefined,
        iban: iban.trim() || undefined,
        priceRange: priceRange.trim() || undefined,
        businessType: businessType.trim() || undefined,
        description: description.trim() || undefined,
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      showToast("Şube talebi oluşturuldu", "success");
      setName("");
      setCity("");
      setRegion("");
      setAddress("");
      setPhone("");
      setIban("");
      setPriceRange("₺₺");
      setBusinessType("restaurant");
      setDescription("");
      setNotes("");
      setCursor(undefined);
      qc.invalidateQueries({
        queryKey: ["org-branch-requests", selectedOrgId],
      });
    },
    onError: (err: any) => {
      const msg =
        err?.response?.data?.message ||
        err?.message ||
        "Şube talebi oluşturulamadı";
      showToast(msg, "error");
    },
  });

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrgId) {
      showToast("Önce bir organizasyon seçin", "error");
      return;
    }
    if (!name.trim()) {
      showToast("Şube adı zorunlu", "error");
      return;
    }
    createMut.mutate();
  };

  const handleChangeOrg = (orgId: string) => {
    setSelectedOrgId(orgId);
    setCursor(undefined);
  };

  const handleChangeStatus = (s: string) => {
    setStatusFilter(s);
    setCursor(undefined);
  };

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/org", label: "Özet" },
          { to: "/org/branch-requests", label: "Şube Talepleri" },
        ]}
      />

      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">Şube Talepleri</h2>

        {/* Filtreler */}
        <Card title="Filtreler">
          <div className="grid md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Organizasyon
              </label>
              <select
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={selectedOrgId}
                onChange={(e) => handleChangeOrg(e.target.value)}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}{" "}
                    {o.region ? `(${o.region})` : ""}
                  </option>
                ))}
                {orgs.length === 0 && (
                  <option value="">Organizasyon bulunamadı</option>
                )}
              </select>
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Durum
              </label>
              <select
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={statusFilter}
                onChange={(e) => handleChangeStatus(e.target.value)}
              >
                <option value="">Hepsi</option>
                <option value="pending">Beklemede</option>
                <option value="approved">Onaylandı</option>
                <option value="rejected">Reddedildi</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Liste */}
        <Card title="Mevcut Talepler">
          {listQ.isLoading ? (
            <div className="text-sm text-gray-500">Yükleniyor…</div>
          ) : items.length === 0 ? (
            <div className="text-sm text-gray-500">
              Henüz şube talebi yok.
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-500">
                      <th className="py-2 px-4">Şube Adı</th>
                      <th className="py-2 px-4">Şehir</th>
                      <th className="py-2 px-4">Durum</th>
                      <th className="py-2 px-4">Oluşturma</th>
                      <th className="py-2 px-4">Son İşlem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((r) => (
                      <tr key={r._id} className="border-t">
                        <td className="py-2 px-4">
                          {r.payload?.name || "-"}
                        </td>
                        <td className="py-2 px-4">
                          {r.payload?.city || "-"}
                        </td>
                        <td className="py-2 px-4">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs inline-flex ${
                              r.status === "approved"
                                ? "bg-emerald-50 text-emerald-700"
                                : r.status === "rejected"
                                ? "bg-rose-50 text-rose-700"
                                : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {STATUS_LABEL[r.status] ?? r.status}
                          </span>
                        </td>
                        <td className="py-2 px-4">
                          {fmtDate(r.createdAt)}
                        </td>
                        <td className="py-2 px-4">
                          {r.status === "rejected" && r.rejectReason
                            ? `Reddedildi: ${r.rejectReason}`
                            : r.resolvedAt
                            ? fmtDate(r.resolvedAt)
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nextCursor && (
                <div className="mt-3">
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg bg-gray-100 hover:bg-gray-200 text-xs"
                    onClick={() => setCursor(nextCursor)}
                    disabled={listQ.isFetching}
                  >
                    Daha Fazla Yükle
                  </button>
                </div>
              )}
            </>
          )}
        </Card>

        {/* Yeni talep formu */}
        <Card title="Yeni Şube Talebi Oluştur">
          <form
            onSubmit={handleCreate}
            className="grid md:grid-cols-3 gap-3"
          >
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Şube Adı *
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Şehir
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Bölge (ülke kodu, örn: TR, UK)
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={region}
                onChange={(e) => setRegion(e.target.value.toUpperCase())}
                maxLength={3}
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs text-gray-600 mb-1">
                Adres
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Telefon
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-xs text-gray-600 mb-1">
                IBAN
              </label>
              <input
                type="text"
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={iban}
                onChange={(e) => setIban(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                Fiyat Aralığı
              </label>
              <select
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={priceRange}
                onChange={(e) => setPriceRange(e.target.value)}
              >
                <option value="₺">₺</option>
                <option value="₺₺">₺₺</option>
                <option value="₺₺₺">₺₺₺</option>
                <option value="₺₺₺₺">₺₺₺₺</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                İşletme Türü
              </label>
              <select
                className="border rounded-lg px-3 py-2 w-full text-sm"
                value={businessType}
                onChange={(e) => setBusinessType(e.target.value)}
              >
                <option value="restaurant">Restaurant</option>
                <option value="bar">Bar</option>
                <option value="pub">Pub</option>
                <option value="cafe">Cafe</option>
                <option value="meyhane">Meyhane</option>
                <option value="other">Diğer</option>
              </select>
            </div>

            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">
                Açıklama (opsiyonel)
              </label>
              <textarea
                className="border rounded-lg px-3 py-2 w-full text-sm min-h-[60px]"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="md:col-span-3">
              <label className="block text-xs text-gray-600 mb-1">
                Not (sadece admin için, opsiyonel)
              </label>
              <textarea
                className="border rounded-lg px-3 py-2 w-full text-sm min-h-[60px]"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div className="md:col-span-3">
              <button
                type="submit"
                disabled={createMut.isPending || !selectedOrgId}
                className="mt-2 px-4 py-2 rounded-lg bg-brand-600 hover:bg-brand-700 text-white text-sm disabled:opacity-60"
              >
                {createMut.isPending
                  ? "Talep gönderiliyor…"
                  : "Şube Talebi Oluştur"}
              </button>
            </div>
          </form>
        </Card>
      </div>
    </div>
  );
}