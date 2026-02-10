import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../api/client";
import Sidebar from "../../components/Sidebar";
import { authStore } from "../../store/auth";
import { Card } from "../../components/Card";
import { useI18n } from "../../i18n";

async function fetchPhotos(rid: string): Promise<string[]> {
  const { data } = await api.get(`/restaurants/${rid}`);
  return data?.photos || [];
}

async function addPhoto(rid: string, url: string) {
  const { data } = await api.post(`/restaurants/${rid}/photos`, { fileUrl: url });
  return data;
}

async function removePhoto(rid: string, url: string) {
  const { data } = await api.delete(`/restaurants/${rid}/photos`, { data: { url } });
  return data;
}

export default function PhotosPage() {
  const rid = authStore.getUser()?.restaurantId || "";
  const qc = useQueryClient();
  const { t } = useI18n();

  const { data, isLoading, error } = useQuery({
    queryKey: ["photos", rid],
    queryFn: () => fetchPhotos(rid),
    enabled: !!rid
  });

  const [url, setUrl] = React.useState("");

  const addMut = useMutation({
    mutationFn: (u: string) => addPhoto(rid, u),
    onSuccess: () => { setUrl(""); qc.invalidateQueries({ queryKey: ["photos", rid] }); }
  });
  const delMut = useMutation({
    mutationFn: (u: string) => removePhoto(rid, u),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["photos", rid] })
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
          { to: "/restaurant/photos", label: t("Fotoğraflar") },
          { to: "/restaurant/profile", label: t("Profil & Ayarlar") }
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">{t("Fotoğraflar")}</h2>
        {isLoading && <div>{t("Yükleniyor…")}</div>}
        {error && <div className="text-red-600 text-sm">{t("Veri getirilemedi")}</div>}

        <Card title={t("Yeni Fotoğraf Ekle (URL)")}>
          <form
            onSubmit={(e)=>{ e.preventDefault(); if (!url) return; addMut.mutate(url); }}
            className="flex items-end gap-3"
          >
            <input className="border rounded-lg px-3 py-2 w-full" placeholder="https://..."
                   value={url} onChange={(e)=>setUrl(e.target.value)} />
            <button type="submit" className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2" disabled={addMut.isPending}>
              {addMut.isPending ? t("Ekleniyor…") : t("Ekle")}
            </button>
          </form>
        </Card>

        <Card title={t("Mevcut Fotoğraflar")}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(data ?? []).map((u)=>(
              <div key={u} className="border rounded-2xl overflow-hidden">
                <img src={u} alt="" className="w-full h-40 object-cover" />
                <div className="p-2 flex justify-between items-center">
                  <a href={u} target="_blank" rel="noreferrer" className="text-xs text-brand-700 underline">{t("Aç")}</a>
                  <button className="text-xs text-red-700" onClick={()=>delMut.mutate(u)} disabled={delMut.isPending}>{t("Sil")}</button>
                </div>
              </div>
            ))}
            {(!data || data.length === 0) && <div className="text-sm text-gray-500">{t("Kayıt yok")}</div>}
          </div>
        </Card>
      </div>
    </div>
  );
}
