import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { authStore } from "../../store/auth";
import { Card } from "../../components/Card";
import { useI18n } from "../../i18n";

type OpeningHour = { day: number; open: string; close: string; isClosed?: boolean };

async function fetchHours(rid: string): Promise<OpeningHour[]> {
  const { data } = await api.get(`/restaurants/${rid}`);
  return data?.openingHours || [];
}

async function updateHours(rid: string, hours: OpeningHour[]) {
  const { data } = await api.put(`/restaurants/${rid}/opening-hours`, { openingHours: hours });
  return data;
}

export default function OpeningHoursPage() {
  const u = authStore.getUser();
  const rid = u?.restaurantId || "";
  const qc = useQueryClient();
  const { t } = useI18n();

  const { data, isLoading, error } = useQuery({
    queryKey: ["opening-hours", rid],
    queryFn: () => fetchHours(rid),
    enabled: !!rid
  });

  const [hours, setHours] = React.useState<OpeningHour[]>([]);
  React.useEffect(() => { if (data) setHours(data); }, [data]);

  const mut = useMutation({
    mutationFn: (payload: OpeningHour[]) => updateHours(rid, payload),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["opening-hours", rid] })
  });

  const days = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: t("Dashboard") },
          { to: "/restaurant/reservations", label: t("Rezervasyonlar") },
          { to: "/restaurant/opening-hours", label: t("Çalışma Saatleri") },
          { to: "/restaurant/tables", label: t("Masalar") },
          { to: "/restaurant/menus", label: t("Menüler") },
          { to: "/restaurant/photos", label: t("Fotoğraflar") },
          { to: "/restaurant/profile", label: t("Profil & Ayarlar") }
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">{t("Çalışma Saatleri")}</h2>
        {isLoading && <div>{t("Yükleniyor…")}</div>}
        {error && <div className="text-red-600 text-sm">{t("Veri getirilemedi")}</div>}

        <Card>
          <div className="space-y-3">
            {hours.map((h, idx) => (
              <div key={idx} className="flex items-center gap-3">
                <div className="w-24 text-sm text-gray-600">
                  {days[h.day] ? t(days[h.day]) : t("Gün {day}", { day: h.day })}
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600">{t("Kapalı")}</span>
                  <input type="checkbox" checked={!!h.isClosed} onChange={(e)=>{
                    const v = e.target.checked;
                    setHours((prev)=> prev.map((x,i)=> i===idx ? { ...x, isClosed:v } : x));
                  }}/>
                </label>
                <input
                  type="time" className="border rounded-lg px-3 py-2"
                  value={h.open} disabled={!!h.isClosed}
                  onChange={(e)=> setHours(prev=> prev.map((x,i)=> i===idx ? { ...x, open:e.target.value } : x))}
                />
                <span>{t("—")}</span>
                <input
                  type="time" className="border rounded-lg px-3 py-2"
                  value={h.close} disabled={!!h.isClosed}
                  onChange={(e)=> setHours(prev=> prev.map((x,i)=> i===idx ? { ...x, close:e.target.value } : x))}
                />
              </div>
            ))}
            {hours.length === 0 && <div className="text-sm text-gray-500">{t("Kayıt yok")}</div>}
          </div>

          <div className="mt-4">
            <button
              onClick={()=>mut.mutate(hours)}
              disabled={mut.isPending}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
            >
              {mut.isPending ? t("Kaydediliyor…") : t("Kaydet")}
            </button>
            {mut.isSuccess && <span className="ml-3 text-sm text-green-700">{t("Güncellendi.")}</span>}
            {mut.isError && <span className="ml-3 text-sm text-red-700">{t("Hata oluştu.")}</span>}
          </div>
        </Card>
      </div>
    </div>
  );
}
