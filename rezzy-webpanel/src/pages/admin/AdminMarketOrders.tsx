import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { adminGetMarketOrders } from "../../api/adminTaxiMarket";
import Sidebar from "../../components/Sidebar";
import { ADMIN_SIDEBAR_ITEMS } from "../../components/adminSidebarItems";
import { useI18n } from "../../i18n";

const STATUSES = ["", "pending", "confirmed", "preparing", "ready", "delivered", "cancelled"];
const STATUS_LABELS: Record<string, string> = {
  "": "Tümü",
  pending: "Beklemede",
  confirmed: "Onaylandı",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  delivered: "Teslim Edildi",
  cancelled: "İptal",
};

export default function AdminMarketOrdersPage() {
  const { t } = useI18n();
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-market-orders", status, page],
    queryFn: () => adminGetMarketOrders({ status: status || undefined, page, limit: 20 }),
  });

  const orders = data?.orders ?? [];
  const pages = data?.pages ?? 1;

  return (
    <div className="flex gap-6">
      <Sidebar items={ADMIN_SIDEBAR_ITEMS.map((i) => ({ ...i, label: t(i.label) }))} />

      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">{t("Market Siparişleri")}</h2>

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
                  {["Sipariş", "Market", "Müşteri", "Tutar", "Tip", "Durum", "Tarih"].map((h) => (
                    <th key={h} className="py-2 px-4">{t(h)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {orders.length === 0 ? (
                  <tr>
                    <td className="py-6 px-4 text-gray-500 text-center" colSpan={7}>
                      {t("Sipariş yok")}
                    </td>
                  </tr>
                ) : (
                  orders.map((o: any) => (
                    <tr key={o._id} className="border-t">
                      <td className="py-2 px-4 font-semibold">
                        #{o._id.slice(-6).toUpperCase()}
                      </td>
                      <td className="py-2 px-4">
                        {typeof o.store === "object" ? o.store.name : "—"}
                      </td>
                      <td className="py-2 px-4">
                        {typeof o.customer === "object" ? o.customer.name : "—"}
                      </td>
                      <td className="py-2 px-4 text-green-700 font-semibold">
                        ₺{Number(o.total ?? 0).toFixed(2)}
                      </td>
                      <td className="py-2 px-4">
                        {o.type === "pickup" ? t("Gel-Al") : t("Teslimat")}
                      </td>
                      <td className="py-2 px-4">
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
                            o.status === "delivered"
                              ? "bg-green-100 text-green-800"
                              : o.status === "cancelled"
                              ? "bg-red-100 text-red-800"
                              : "bg-yellow-100 text-yellow-800"
                          }`}
                        >
                          {t(STATUS_LABELS[o.status] ?? o.status)}
                        </span>
                      </td>
                      <td className="py-2 px-4 text-gray-500">
                        {new Date(o.createdAt).toLocaleDateString("tr-TR")}
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
