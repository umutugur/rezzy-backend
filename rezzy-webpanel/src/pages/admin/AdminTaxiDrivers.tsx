import React, { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { adminGetTaxiDrivers, adminApproveDriver, adminRejectDriver } from "../../api/adminTaxiMarket";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

type FilterKind = "all" | "pending" | "approved";

export default function AdminTaxiDriversPage() {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<FilterKind>("pending");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-taxi-drivers", filter, page],
    queryFn: () =>
      adminGetTaxiDrivers({
        isApproved: filter === "all" ? undefined : filter === "approved",
        page,
        limit: 20,
      }),
  });

  const drivers = data?.drivers ?? [];
  const pages = data?.pages ?? 1;

  const { mutate: approve } = useMutation({
    mutationFn: (id: string) => adminApproveDriver(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-taxi-drivers"] });
      showToast(t("Onaylandı"), "success");
    },
    onError: () => showToast(t("İşlem başarısız"), "error"),
  });

  const { mutate: reject } = useMutation({
    mutationFn: (id: string) => adminRejectDriver(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-taxi-drivers"] });
      showToast(t("Reddedildi"), "success");
    },
    onError: () => showToast(t("İşlem başarısız"), "error"),
  });

  const filterLabels: Record<FilterKind, string> = {
    pending: t("Beklemede"),
    approved: t("Onaylı"),
    all: t("Tümü"),
  };

  return (
          <div className="space-y-6 p-6">
        <h2 className="text-lg font-semibold">{t("Sürücü Başvuruları")}</h2>

        {/* Filter tabs */}
        <div className="flex gap-2">
          {(["pending", "approved", "all"] as FilterKind[]).map((f) => (
            <button
              key={f}
              onClick={() => { setFilter(f); setPage(1); }}
              className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                filter === f
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {filterLabels[f]}
            </button>
          ))}
        </div>

        {isLoading && <div>{t("Yükleniyor…")}</div>}

        {!isLoading && (
          <div className="overflow-auto bg-white rounded-2xl shadow-soft">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b">
                <tr className="text-left text-gray-500">
                  {["Kullanıcı", "Plaka", "Araç", "Tip", "Durum", "Tarih", "İşlem"].map((h) => (
                    <th key={h} className="py-2 px-4">{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {drivers.length === 0 ? (
                  <tr>
                    <td className="py-6 px-4 text-gray-500 text-center" colSpan={7}>
                      {t("Başvuru yok")}
                    </td>
                  </tr>
                ) : (
                  drivers.map((d: any) => (
                    <tr key={d._id} className="border-t">
                      <td className="py-2 px-4">
                        <div className="font-semibold">{d.user?.name ?? "—"}</div>
                        <div className="text-xs text-gray-500">{d.user?.email ?? ""}</div>
                      </td>
                      <td className="py-2 px-4 font-semibold">{d.vehiclePlate}</td>
                      <td className="py-2 px-4">
                        {d.vehicleBrand} {d.vehicleModel}{" "}
                        <span className="text-gray-400">({d.vehicleColor})</span>
                      </td>
                      <td className="py-2 px-4 capitalize">{d.type}</td>
                      <td className="py-2 px-4">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            d.isApproved
                              ? "bg-green-100 text-green-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {d.isApproved ? t("Onaylı") : t("Beklemede")}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-gray-500">
                        {new Date(d.createdAt).toLocaleDateString("tr-TR")}
                      </td>
                      <td className="py-2 px-4">
                        {!d.isApproved ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => approve(d._id)}
                              className="px-3 py-1.5 rounded-lg bg-green-600 hover:bg-green-700 text-white text-xs font-semibold"
                            >
                              {t("Onayla")}
                            </button>
                            <button
                              onClick={() => reject(d._id)}
                              className="px-3 py-1.5 rounded-lg border border-red-400 text-red-600 hover:bg-red-50 text-xs"
                            >
                              {t("Reddet")}
                            </button>
                          </div>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-end gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page === 1}
              className="px-4 py-1.5 rounded-lg border border-gray-300 bg-white text-sm disabled:opacity-50"
            >
              ← {t("Önceki")}
            </button>
            <span className="text-sm text-gray-600">
              {page} / {pages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(pages, p + 1))}
              disabled={page === pages}
              className="px-4 py-1.5 rounded-lg border border-gray-300 bg-white text-sm disabled:opacity-50"
            >
              {t("Sonraki")} →
            </button>
          </div>
        )}
      </div>
  );
}
