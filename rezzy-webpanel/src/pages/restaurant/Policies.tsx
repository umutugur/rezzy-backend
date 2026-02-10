// src/pages/restaurant/Policies.tsx
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { authStore } from "../../store/auth";
import { Card } from "../../components/Card";
import { useI18n } from "../../i18n";

type Policies = {
  minPartySize: number;
  maxPartySize: number;
  slotMinutes: number;

  // depozito
  depositType?: "percent" | "flat";
  depositRate?: number;     // yüzde
  depositAmount?: number;   // sabit
  minDeposit?: number;      // alt limit

  // check-in penceresi ve eksik katılım
  checkinWindowBeforeMinutes?: number; // default 15
  checkinWindowAfterMinutes?: number;  // default 90
  underattendanceThresholdPercent?: number; // default 80
};

async function fetchPolicies(rid: string): Promise<Policies> {
  const { data } = await api.get(`/restaurants/${rid}`);
  // restoran dokümanından normalize et
  return {
    minPartySize: Number(data?.minPartySize ?? 1),
    maxPartySize: Number(data?.maxPartySize ?? 8),
    slotMinutes: Number(data?.slotMinutes ?? 90),
    depositType: data?.depositType ?? undefined,
    depositRate: Number(
      data?.depositRate ?? data?.depositPercent ?? data?.settings?.depositRate ?? 0
    ),
    depositAmount: Number(data?.depositAmount ?? data?.settings?.depositAmount ?? 0),
    minDeposit: Number(data?.minDeposit ?? data?.settings?.minDeposit ?? 0),
    checkinWindowBeforeMinutes: Number(data?.checkinWindowBeforeMinutes ?? 15),
    checkinWindowAfterMinutes: Number(data?.checkinWindowAfterMinutes ?? 90),
    underattendanceThresholdPercent: Number(data?.underattendanceThresholdPercent ?? 80),
  };
}

async function updatePolicies(rid: string, p: Policies) {
  const { data } = await api.put(`/restaurants/${rid}/policies`, p);
  return data;
}

export default function PoliciesPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();
  const { t } = useI18n();

  const { data, isLoading, error } = useQuery({
    queryKey: ["policies", rid],
    queryFn: () => fetchPolicies(rid),
    enabled: !!rid,
  });

  const [form, setForm] = React.useState<Policies>({
    minPartySize: 1,
    maxPartySize: 8,
    slotMinutes: 90,
    depositType: "percent",
    depositRate: 0,
    depositAmount: 0,
    minDeposit: 0,
    checkinWindowBeforeMinutes: 15,
    checkinWindowAfterMinutes: 90,
    underattendanceThresholdPercent: 80,
  });

  React.useEffect(() => {
    if (data) setForm(data);
  }, [data]);

  const mut = useMutation({
    mutationFn: () => updatePolicies(rid, form),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["policies", rid] }),
  });

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: t("Dashboard") },
          { to: "/restaurant/reservations", label: t("Rezervasyonlar") },
          { to: "/restaurant/opening-hours", label: t("Çalışma Saatleri") },
          { to: "/restaurant/tables", label: t("Masalar") },
          { to: "/restaurant/menus", label: t("Menüler") },
          { to: "/restaurant/policies", label: t("Politikalar") },
          { to: "/restaurant/photos", label: t("Fotoğraflar") },
          { to: "/restaurant/profile", label: t("Profil & Ayarlar") },
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">{t("Rezervasyon Politikaları")}</h2>

        {isLoading && <div>{t("Yükleniyor…")}</div>}
        {error && <div className="text-red-600 text-sm">{t("Veri getirilemedi")}</div>}

        <Card title={t("Genel")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t("Minimum Kişi")}</label>
              <input
                type="number"
                min={1}
                className="w-full border rounded-lg px-3 py-2"
                value={form.minPartySize}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minPartySize: Math.max(1, Number(e.target.value) || 1) }))
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t("Maksimum Kişi")}</label>
              <input
                type="number"
                min={form.minPartySize}
                className="w-full border rounded-lg px-3 py-2"
                value={form.maxPartySize}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    maxPartySize: Math.max(f.minPartySize, Number(e.target.value) || f.minPartySize),
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t("Slot Süresi (dk)")}</label>
              <input
                type="number"
                min={30}
                className="w-full border rounded-lg px-3 py-2"
                value={form.slotMinutes}
                onChange={(e) =>
                  setForm((f) => ({ ...f, slotMinutes: Math.max(30, Number(e.target.value) || 30) }))
                }
              />
            </div>
          </div>
        </Card>

        <Card title={t("Depozito")}>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t("Tür")}</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={form.depositType ?? "percent"}
                onChange={(e) => setForm((f) => ({ ...f, depositType: e.target.value as any }))}
              >
                <option value="percent">{t("Yüzde")}</option>
                <option value="flat">{t("Sabit")}</option>
              </select>
            </div>
            {form.depositType === "percent" ? (
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t("Yüzde (%)")}</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border rounded-lg px-3 py-2"
                  value={form.depositRate ?? 0}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, depositRate: Math.max(0, Number(e.target.value) || 0) }))
                  }
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm text-gray-600 mb-1">{t("Tutar (₺)")}</label>
                <input
                  type="number"
                  min={0}
                  className="w-full border rounded-lg px-3 py-2"
                  value={form.depositAmount ?? 0}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      depositAmount: Math.max(0, Number(e.target.value) || 0),
                    }))
                  }
                />
              </div>
            )}
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t("Minimum Depozito (₺)")}</label>
              <input
                type="number"
                min={0}
                className="w-full border rounded-lg px-3 py-2"
                value={form.minDeposit ?? 0}
                onChange={(e) =>
                  setForm((f) => ({ ...f, minDeposit: Math.max(0, Number(e.target.value) || 0) }))
                }
              />
            </div>
          </div>
        </Card>

        <Card title={t("Check-in & Eksik Katılım")}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Check-in Penceresi (Öncesi, dk)")}
              </label>
              <input
                type="number"
                min={0}
                className="w-full border rounded-lg px-3 py-2"
                value={form.checkinWindowBeforeMinutes ?? 15}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    checkinWindowBeforeMinutes: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">
                {t("Check-in Penceresi (Sonrası, dk)")}
              </label>
              <input
                type="number"
                min={0}
                className="w-full border rounded-lg px-3 py-2"
                value={form.checkinWindowAfterMinutes ?? 90}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    checkinWindowAfterMinutes: Math.max(0, Number(e.target.value) || 0),
                  }))
                }
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">{t("Eksik Katılım Eşiği (%)")}</label>
              <input
                type="number"
                min={0}
                max={100}
                className="w-full border rounded-lg px-3 py-2"
                value={form.underattendanceThresholdPercent ?? 80}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    underattendanceThresholdPercent: Math.min(
                      100,
                      Math.max(0, Number(e.target.value) || 0)
                    ),
                  }))
                }
              />
            </div>
          </div>
        </Card>

        <div>
          <button
            onClick={() => mut.mutate()}
            disabled={mut.isPending}
            className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
          >
            {mut.isPending ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
          {mut.isSuccess && (
            <span className="ml-3 text-sm text-green-700">{t("Güncellendi.")}</span>
          )}
          {mut.isError && (
            <span className="ml-3 text-sm text-red-700">{t("Hata oluştu.")}</span>
          )}
        </div>
      </div>
    </div>
  );
}
