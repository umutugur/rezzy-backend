// pages/admin/commissions.tsx
import React from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "../../components/Card";
import { adminPreviewCommissions, adminExportCommissions } from "../../api/client";
import { showToast } from "../../ui/Toast";
import { useI18n } from "../../i18n";

type CommissionTab = "reservation" | "delivery" | "market" | "taxi";

function currentMonth() {
  const d = new Date();
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function fmtCur(val: number | string | undefined | null) {
  return Number(val ?? 0).toLocaleString("tr-TR", { maximumFractionDigits: 2 });
}

export default function AdminCommissionsPage() {
  const { t } = useI18n();
  const [month, setMonth] = React.useState<string>(currentMonth());
  const [tab, setTab] = React.useState<CommissionTab>("reservation");

  const q = useQuery({
    queryKey: ["admin-commissions", month],
    queryFn: () => adminPreviewCommissions(month),
  });

  const rows = q.data?.restaurants || [];

  const downloadExcel = async () => {
    try {
      const blob = await adminExportCommissions(month);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `rezvix-komisyon-${month}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      showToast(e?.message || t("Excel indirilemedi"), "error");
    }
  };

  const totalArrived = rows.reduce((a,r)=>a + (r.arrivedCount || 0), 0);
  const totalRevenue = rows.reduce((a,r)=>a + (r.revenueArrived || 0), 0);
  const totalCommission = rows.reduce((a,r)=>a + (r.commissionAmount || 0), 0);

  const TABS: Array<{ key: CommissionTab; label: string }> = [
    { key: "reservation", label: t("Rezervasyon") },
    { key: "delivery",    label: t("🛵 Paket Servis") },
    { key: "market",      label: t("🛒 Market") },
    { key: "taxi",        label: t("🚕 Taksi") },
  ];

  return (
          <div className="space-y-6 p-6">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t("Aylık Komisyonlar")}</h2>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs text-gray-600 mb-1">{t("Ay")}</label>
              <input
                type="month"
                className="border rounded-lg px-3 py-2 text-sm"
                value={month}
                onChange={(e)=>setMonth(e.target.value)}
              />
            </div>
            {tab === "reservation" && (
              <button
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
                onClick={downloadExcel}
                disabled={q.isLoading}
              >
                {q.isLoading ? t("Hazırlanıyor…") : t("Excel'e Aktar")}
              </button>
            )}
          </div>
        </div>

        {/* Tab row */}
        <div className="flex gap-1 border-b">
          {TABS.map((tb) => (
            <button
              key={tb.key}
              onClick={() => setTab(tb.key)}
              className={`px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px ${
                tab === tb.key
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-gray-500 hover:text-gray-700"
              }`}
            >
              {tb.label}
            </button>
          ))}
        </div>

        {q.isLoading && <div>{t("Yükleniyor…")}</div>}
        {q.error && <div className="text-red-600 text-sm">{t("Veri alınamadı")}</div>}

        {/* ===== REZERVASYON TAB ===== */}
        {tab === "reservation" && (
          <>
            <Card title={t("Özet • {month}", { month: q.data?.month || month })}>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <div className="text-xs text-gray-600">{t("Arrived Rezervasyon")}</div>
                  <div className="text-xl font-semibold">{totalArrived}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <div className="text-xs text-gray-600">{t("Arrived Toplam (₺)")}</div>
                  <div className="text-xl font-semibold">{totalRevenue.toLocaleString("tr-TR")}</div>
                </div>
                <div className="p-3 bg-gray-50 rounded-lg border">
                  <div className="text-xs text-gray-600">{t("Komisyon Toplamı (₺)")}</div>
                  <div className="text-xl font-semibold">{totalCommission.toLocaleString("tr-TR")}</div>
                </div>
              </div>
            </Card>

            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">{t("Restoran")}</th>
                    <th className="py-2 px-4">{t("Sahip")}</th>
                    <th className="py-2 px-4">{t("E-posta")}</th>
                    <th className="py-2 px-4">{t("Arrived")}</th>
                    <th className="py-2 px-4">{t("Arrived Toplam (₺)")}</th>
                    <th className="py-2 px-4">{t("Komisyon Oranı")}</th>
                    <th className="py-2 px-4">{t("Komisyon (₺)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r:any)=>(
                    <tr key={r._id} className="border-t">
                      <td className="py-2 px-4">{r.restaurantName}</td>
                      <td className="py-2 px-4">{r.ownerName || t("—")}</td>
                      <td className="py-2 px-4">{r.ownerEmail || t("—")}</td>
                      <td className="py-2 px-4">{r.arrivedCount}</td>
                      <td className="py-2 px-4">{Number(r.revenueArrived || 0).toLocaleString("tr-TR")}</td>
                      <td className="py-2 px-4">{Number(r.commissionRate || 0)}</td>
                      <td className="py-2 px-4">{Number(r.commissionAmount || 0).toLocaleString("tr-TR")}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td className="py-4 px-4 text-gray-500" colSpan={7}>{t("Kayıt yok")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* ===== PAKET SERVİS TAB ===== */}
        {tab === "delivery" && (
          <div className="space-y-3">
            {q.data?.modules?.delivery && (
              <div className="text-sm text-gray-600">
                {t("Toplam")}: <span className="font-semibold">{fmtCur(q.data.modules.delivery.total)} ₺</span>
              </div>
            )}
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">{t("Restoran")}</th>
                    <th className="py-2 px-4">{t("Sipariş Sayısı")}</th>
                    <th className="py-2 px-4">{t("Komisyon (₺)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data?.modules?.delivery?.rows ?? []).map((r) => (
                    <tr key={r.restaurantId} className="border-t">
                      <td className="py-2 px-4">{r.restaurantName}</td>
                      <td className="py-2 px-4">{r.orderCount}</td>
                      <td className="py-2 px-4">{fmtCur(r.commissionAmount)}</td>
                    </tr>
                  ))}
                  {(q.data?.modules?.delivery?.rows ?? []).length === 0 && (
                    <tr><td className="py-4 px-4 text-gray-500" colSpan={3}>{t("Kayıt yok")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== MARKET TAB ===== */}
        {tab === "market" && (
          <div className="space-y-3">
            {q.data?.modules?.market && (
              <div className="text-sm text-gray-600">
                {t("Toplam")}: <span className="font-semibold">{fmtCur(q.data.modules.market.total)} ₺</span>
              </div>
            )}
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">{t("Market")}</th>
                    <th className="py-2 px-4">{t("Sipariş Sayısı")}</th>
                    <th className="py-2 px-4">{t("Komisyon (₺)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data?.modules?.market?.rows ?? []).map((r) => (
                    <tr key={r.storeId} className="border-t">
                      <td className="py-2 px-4">{r.storeName}</td>
                      <td className="py-2 px-4">{r.orderCount}</td>
                      <td className="py-2 px-4">{fmtCur(r.commissionAmount)}</td>
                    </tr>
                  ))}
                  {(q.data?.modules?.market?.rows ?? []).length === 0 && (
                    <tr><td className="py-4 px-4 text-gray-500" colSpan={3}>{t("Kayıt yok")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ===== TAKSİ TAB ===== */}
        {tab === "taxi" && (
          <div className="space-y-3">
            {q.data?.modules?.taxi && (
              <div className="text-sm text-gray-600">
                {t("Toplam")}: <span className="font-semibold">{fmtCur(q.data.modules.taxi.total)} ₺</span>
              </div>
            )}
            <div className="overflow-auto rounded-xl border">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="text-left text-gray-500">
                    <th className="py-2 px-4">{t("Bölge")}</th>
                    <th className="py-2 px-4">{t("Yolculuk Sayısı")}</th>
                    <th className="py-2 px-4">{t("Komisyon (₺)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(q.data?.modules?.taxi?.rows ?? []).map((r) => (
                    <tr key={r.region} className="border-t">
                      <td className="py-2 px-4">{r.region}</td>
                      <td className="py-2 px-4">{r.rideCount}</td>
                      <td className="py-2 px-4">{fmtCur(r.commissionAmount)}</td>
                    </tr>
                  ))}
                  {(q.data?.modules?.taxi?.rows ?? []).length === 0 && (
                    <tr><td className="py-4 px-4 text-gray-500" colSpan={3}>{t("Kayıt yok")}</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
  );
}
