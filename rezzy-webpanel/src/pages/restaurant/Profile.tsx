// src/pages/restaurant/Profile.tsx
import React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Sidebar from "../../components/Sidebar";
import { Card } from "../../components/Card";
import { authStore } from "../../store/auth";
import { asId } from "../../lib/id";
import {
  restaurantGet,
  restaurantUpdateProfile,
  restaurantAddPhoto,
  restaurantRemovePhoto,
} from "../../api/client";
import { showToast } from "../../ui/Toast";

type Restaurant = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  description?: string;
  photos?: string[];

  // 👇 mobil paritesi
  iban?: string;
  ibanName?: string;
  bankName?: string;
};

export default function RestaurantProfilePage() {
  const rid = asId(authStore.getUser()?.restaurantId) || "";
  const qc = useQueryClient();

  const { data, isLoading, error } = useQuery<Restaurant>({
    queryKey: ["restaurant-detail", rid],
    queryFn: () => restaurantGet(rid),
    enabled: !!rid,
  });

  const [form, setForm] = React.useState<Partial<Restaurant>>({});

  React.useEffect(() => {
    if (data) {
      setForm({
        name: data.name,
        email: data.email,
        phone: data.phone,
        city: data.city,
        address: data.address,
        description: data.description,
        iban: data.iban,
        ibanName: data.ibanName,
        bankName: data.bankName,
      });
    }
  }, [data]);

  const saveMut = useMutation({
    mutationFn: () => restaurantUpdateProfile(rid, form),
    onSuccess: () => {
      showToast("Kaydedildi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => {
      showToast(e?.response?.data?.message || e?.message || "Kaydedilemedi", "error");
    },
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => restaurantAddPhoto(rid, file),
    onSuccess: () => {
      showToast("Fotoğraf yüklendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => {
      showToast(e?.response?.data?.message || e?.message || "Fotoğraf yüklenemedi", "error");
    },
  });

  const removeMut = useMutation({
    mutationFn: (url: string) => restaurantRemovePhoto(rid, url),
    onSuccess: () => {
      showToast("Silindi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => {
      showToast(e?.response?.data?.message || e?.message || "Silinemedi", "error");
    },
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMut.mutate(f);
    e.currentTarget.value = "";
  };

  return (
    <div className="flex gap-6">
      <Sidebar
        items={[
          { to: "/restaurant", label: "Dashboard" },
          { to: "/restaurant/reservations", label: "Rezervasyonlar" },
          { to: "/restaurant/profile", label: "Profil & Ayarlar" },
        ]}
      />
      <div className="flex-1 space-y-6">
        <h2 className="text-lg font-semibold">Profil & Ayarlar</h2>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Bilgiler alınamadı</div>}

        <Card title="Temel Bilgiler">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Ad</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.name || ""}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">E-posta</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.email || ""}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Telefon</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.phone || ""}
                onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Şehir</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.city || ""}
                onChange={(e) => setForm((f) => ({ ...f, city: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Adres</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.address || ""}
                onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              />
            </div>
            <div className="md:col-span-2">
              <label className="block text-sm text-gray-600 mb-1">Açıklama</label>
              <textarea
                className="w-full rounded-lg border border-gray-300 px-3 py-2 h-40"
                value={form.description || ""}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
              />
            </div>

            {/* Mobil paritesi: Ödeme bilgileri */}
            <div>
              <label className="block text-sm text-gray-600 mb-1">IBAN</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="TR.."
                value={form.iban || ""}
                onChange={(e) => setForm((f) => ({ ...f, iban: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">IBAN Adı</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                placeholder="Hesap Sahibi"
                value={form.ibanName || ""}
                onChange={(e) => setForm((f) => ({ ...f, ibanName: e.target.value }))}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">Banka Adı</label>
              <input
                className="w-full rounded-lg border border-gray-300 px-3 py-2"
                value={form.bankName || ""}
                onChange={(e) => setForm((f) => ({ ...f, bankName: e.target.value }))}
              />
            </div>
          </div>

          <div className="mt-4">
            <button
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending}
              className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
            >
              {saveMut.isPending ? "Kaydediliyor…" : "Kaydet"}
            </button>
          </div>
        </Card>

        <Card title="Fotoğraflar">
          <div className="mb-3 flex items-center gap-3">
            <input type="file" accept="image/*" onChange={onFile} />
            {uploadMut.isPending && (
              <span className="text-sm text-gray-500">Yükleniyor…</span>
            )}
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {(data?.photos ?? []).map((url) => (
              <div key={url} className="relative group rounded-xl overflow-hidden border">
                <img src={url} alt="photo" className="w-full h-40 object-cover" />
                <button
                  onClick={() => removeMut.mutate(url)}
                  disabled={removeMut.isPending}
                  className="absolute top-2 right-2 text-xs rounded-md bg-black/60 text-white px-2 py-1 opacity-0 group-hover:opacity-100 disabled:opacity-60"
                >
                  Sil
                </button>
              </div>
            ))}
            {(!data?.photos || data.photos.length === 0) && (
              <div className="text-sm text-gray-500">Fotoğraf yok</div>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
