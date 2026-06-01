import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGetTaxiRides } from "../../api/adminTaxiMarket";
import Sidebar from "../../components/Sidebar";
import { useI18n } from "../../i18n";

const STATUSES = ["", "searching", "matched", "inProgress", "completed", "cancelled"];
const STATUS_LABELS: Record<string, string> = {
  "": "Tümü",
  searching: "Aranıyor",
  matched: "Eşleşti",
  inProgress: "Devam Ediyor",
  completed: "Tamamlandı",
  cancelled: "İptal",
};

const SIDEBAR_ITEMS = [
  { to: "/admin", label: "Dashboard" },
  { to: "/admin/banners", label: "Bannerlar" },
  { to: "/admin/commissions", label: "Komisyonlar" },
  { to: "/admin/organizations", label: "Organizasyonlar" },
  { to: "/admin/restaurants", label: "Restoranlar" },
  { to: "/admin/users", label: "Kullanıcılar" },
  { to: "/admin/reservations", label: "Rezervasyonlar" },
  { to: "/admin/moderation", label: "Moderasyon" },
  { to: "/admin/notifications", label: "Bildirim Gönder" },
  { to: "/admin/taxi/drivers", label: "🚕 Sürücü Başvuruları" },
  { to: "/admin/taxi/rides", label: "🗺️ Taksi Yolculukları" },
  { to: "/admin/market/orders", label: "🛒 Market Siparişleri" },
];

export default function AdminTaxiRidesPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-taxi-rides", status, page],
    queryFn: () => adminGetTaxiRides({ status: status || undefined, page, limit: 20 }),
  });

  const rides = data?.rides ?? [];
  const pages = data?.pages ?? 1;

  return (
    <div className="flex gap-6">
      <Sidebar items={SIDEBAR_ITEMS.map((i) => ({ ...i, label: t(i.label) }))} />

      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">{t("Taksi Yolculukları")}</h2>

        {/* Status filter */}
        <div className="flex gap-2 flex-wrap">
          {STATUSES.map((s) => (
            <button
              key={s}
              onClick={() => { setStatus(s); setPage(1); }}
              className={`px-4 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                status === s
                  ? "bg-brand-600 text-white border-brand-600"
                  : "bg-white text-gray-700 border-gray-300 hover:bg-gray-50"
              }`}
            >
              {t(STATUS_LABELS[s])}
            </button>
          ))}
        </div>

        {isLoading && <div>{t("Yükleniyor…")}</div>}

        {!isLoading && (
          <div className="overflow-auto bg-white rounded-2xl shadow-soft">
            <table className="min-w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b">
                <tr className="text-left text-gray-500">
                  {["ID", "Yolcu", "Sürücü", "Ücret", "Mesafe", "Durum", "Tarih"].map((h) => (
                    <th key={h} className="py-2 px-4">{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rides.length === 0 ? (
                  <tr>
                    <td className="py-6 px-4 text-gray-500 text-center" colSpan={7}>
                      {t("Yolculuk yok")}
                    </td>
                  </tr>
                ) : (
                  rides.map((r: any) => (
                    <tr key={r._id} className="border-t">
                      <td className="py-2 px-4 font-semibold">
                        #{r._id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-2 px-4">
                        {typeof r.passenger === "object" ? r.passenger.name : "—"}
                      </td>
                      <td className="py-2 px-4">
                        {r.driver?.user?.name ?? "—"}
                      </td>
                      <td className="py-2 px-4 text-green-700 font-semibold">
                        ₺{Number(r.fare ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-4">
                        {Number(r.distanceKm ?? 0).toFixed(1)} km
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            r.status === "completed"
                              ? "bg-green-100 text-green-800"
                              : r.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-violet-100 text-violet-800"
                          }`}
                        >
                          {t(STATUS_LABELS[r.status] ?? r.status)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-gray-500">
                        {new Date(r.requestedAt ?? r.createdAt).toLocaleDateString("tr-TR")}
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
    </div>
  );
}
