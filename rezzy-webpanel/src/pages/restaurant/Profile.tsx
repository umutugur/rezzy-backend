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
  api,
} from "../../api/client";
import { showToast } from "../../ui/Toast";

// === Tipler ===
type OpeningHour = { day: number; open: string; close: string; isClosed?: boolean };
type MenuItem = { name: string; price: number; description?: string; isActive?: boolean };
type TableItem = { name: string; capacity: number; isActive?: boolean };
type Policies = {
  minPartySize: number;
  maxPartySize: number;
  slotMinutes: number;
  depositRequired: boolean;
  depositAmount: number;
  blackoutDates: string[];
  checkinWindowBeforeMinutes: number;
  checkinWindowAfterMinutes: number;
};
type Restaurant = {
  _id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  address?: string;
  description?: string;
  photos?: string[];

  // ödeme bilgileri
  iban?: string;
  ibanName?: string;
  bankName?: string;

  // toplu alanlar
  menus?: any[];
  tables?: TableItem[];
  openingHours?: OpeningHour[];
  minPartySize?: number;
  maxPartySize?: number;
  slotMinutes?: number;
  depositRequired?: boolean;
  depositAmount?: number;
  blackoutDates?: string[];
  checkinWindowBeforeMinutes: number;
  checkinWindowAfterMinutes: number;
};

const DAYS = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"] as const;

const DEFAULT_OPENING_HOURS: OpeningHour[] = Array.from({ length: 7 }, (_, i) => ({
  day: i,
  open: "10:00",
  close: "23:00",
  isClosed: false,
}));
const DEFAULT_POLICIES: Policies = {
  minPartySize: 1,
  maxPartySize: 8,
  slotMinutes: 90,
  depositRequired: false,
  depositAmount: 0,
  blackoutDates: [],
  checkinWindowBeforeMinutes: 15,
  checkinWindowAfterMinutes: 90,
};

type TabKey = "general" | "photos" | "menus" | "tables" | "hours" | "policies";

export default function RestaurantProfilePage() {
  const rid = asId(authStore.getUser()?.restaurantId) || "";
  const qc = useQueryClient();

  const [tab, setTab] = React.useState<TabKey>("general");

  const { data, isLoading, error } = useQuery<Restaurant>({
    queryKey: ["restaurant-detail", rid],
    queryFn: () => restaurantGet(rid),
    enabled: !!rid,
  });

  const [form, setForm] = React.useState<Partial<Restaurant>>({});
  const [menus, setMenus] = React.useState<MenuItem[]>([]);
  const [tables, setTables] = React.useState<TableItem[]>([]);
  const [hours, setHours] = React.useState<OpeningHour[]>(DEFAULT_OPENING_HOURS);
  const [policies, setPolicies] = React.useState<Policies>(DEFAULT_POLICIES);
  const [newBlackout, setNewBlackout] = React.useState("");

  React.useEffect(() => {
    if (!data) return;

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

    // 🆕 Menüler: description'ı da al
    setMenus(
      Array.isArray(data.menus)
        ? data.menus.map((m: any) => ({
            name: m.name ?? m.title ?? "",
            price: Number(m.price ?? m.pricePerPerson ?? 0),
            description: m.description ?? "", // <-- önemli
            isActive: m.isActive ?? true,
          }))
        : []
    );

    setTables(Array.isArray(data.tables) ? data.tables : []);
    setHours(
      Array.isArray(data.openingHours) && data.openingHours.length === 7
        ? data.openingHours
        : DEFAULT_OPENING_HOURS
    );
    setPolicies({
      minPartySize: data.minPartySize ?? DEFAULT_POLICIES.minPartySize,
      maxPartySize: data.maxPartySize ?? DEFAULT_POLICIES.maxPartySize,
      slotMinutes: data.slotMinutes ?? DEFAULT_POLICIES.slotMinutes,
      depositRequired: data.depositRequired ?? DEFAULT_POLICIES.depositRequired,
      depositAmount: data.depositAmount ?? DEFAULT_POLICIES.depositAmount,
      blackoutDates: Array.isArray(data.blackoutDates) ? data.blackoutDates : [],
      checkinWindowBeforeMinutes:
      typeof data.checkinWindowBeforeMinutes === "number"
        ? data.checkinWindowBeforeMinutes
        : DEFAULT_POLICIES.checkinWindowBeforeMinutes,
    checkinWindowAfterMinutes:
      typeof data.checkinWindowAfterMinutes === "number"
        ? data.checkinWindowAfterMinutes
        : DEFAULT_POLICIES.checkinWindowAfterMinutes,
    });
  }, [data]);

  // Mutations
  const saveGeneralMut = useMutation({
    mutationFn: () => restaurantUpdateProfile(rid, form),
    onSuccess: () => {
      showToast("Kaydedildi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "Kaydedilemedi", "error"),
  });

  const uploadMut = useMutation({
    mutationFn: (file: File) => restaurantAddPhoto(rid, file),
    onSuccess: () => {
      showToast("Fotoğraf yüklendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "Fotoğraf yüklenemedi", "error"),
  });

  const removePhotoMut = useMutation({
    mutationFn: (url: string) => restaurantRemovePhoto(rid, url),
    onSuccess: () => {
      showToast("Silindi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "Silinemedi", "error"),
  });

  const saveMenusMut = useMutation({
    mutationFn: async () => {
      const payload = menus.map((m) => ({
        title: m.name,
        pricePerPerson: m.price,
        description: m.description || "", // 🆕 backend'e gönder
        isActive: m.isActive ?? true,
      }));
      await api.put(`/restaurants/${rid}/menus`, { menus: payload });
    },
    onSuccess: () => {
      showToast("Menüler güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message || e?.message || "Menüler kaydedilemedi", "error"),
  });

  const saveTablesMut = useMutation({
    mutationFn: async () => {
      await api.put(`/restaurants/${rid}/tables`, { tables });
    },
    onSuccess: () => {
      showToast("Masalar güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) => showToast(e?.response?.data?.message || e?.message || "Masalar kaydedilemedi", "error"),
  });

  const saveHoursMut = useMutation({
    mutationFn: async () => {
      await api.put(`/restaurants/${rid}/opening-hours`, { openingHours: hours });
    },
    onSuccess: () => {
      showToast("Çalışma saatleri güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message || e?.message || "Saatler kaydedilemedi", "error"),
  });

  const savePoliciesMut = useMutation({
    mutationFn: async () => {
      const payload = {
        minPartySize: Math.max(1, policies.minPartySize),
        maxPartySize: Math.max(policies.minPartySize, policies.maxPartySize),
        slotMinutes: Math.max(30, policies.slotMinutes),
        depositRequired: !!policies.depositRequired,
        depositAmount: Math.max(0, policies.depositAmount),
        blackoutDates: policies.blackoutDates,
         checkinWindowBeforeMinutes: Math.max(0, policies.checkinWindowBeforeMinutes),
      checkinWindowAfterMinutes: Math.max(0, policies.checkinWindowAfterMinutes),
      };
      await api.put(`/restaurants/${rid}/policies`, payload);
    },
    onSuccess: () => {
      showToast("Politikalar güncellendi", "success");
      qc.invalidateQueries({ queryKey: ["restaurant-detail", rid] });
    },
    onError: (e: any) =>
      showToast(e?.response?.data?.message || e?.message || "Politikalar kaydedilemedi", "error"),
  });

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) uploadMut.mutate(f);
    e.currentTarget.value = "";
  };

  const TabBar = (
    <div className="flex flex-wrap gap-2">
      {(
        [
          ["general", "Genel"],
          ["photos", "Fotoğraflar"],
          ["menus", "Menüler"],
          ["tables", "Masalar"],
          ["hours", "Saatler"],
          ["policies", "Politikalar"],
        ] as Array<[TabKey, string]>
      ).map(([k, label]) => (
        <button
          key={k}
          onClick={() => setTab(k)}
          className={
            "px-3 py-1.5 rounded-lg text-sm " +
            (tab === k ? "bg-brand-600 text-white" : "bg-gray-100 hover:bg-gray-200")
          }
        >
          {label}
        </button>
      ))}
    </div>
  );

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
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Profil & Ayarlar</h2>
          {TabBar}
        </div>

        {isLoading && <div>Yükleniyor…</div>}
        {error && <div className="text-red-600 text-sm">Bilgiler alınamadı</div>}

        {/* === GENEL === */}
        {tab === "general" && (
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
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>

              {/* Ödeme bilgileri */}
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
                onClick={() => saveGeneralMut.mutate()}
                disabled={saveGeneralMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2 disabled:opacity-60"
              >
                {saveGeneralMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === FOTOĞRAFLAR === */}
        {tab === "photos" && (
          <Card title="Fotoğraflar">
            <div className="mb-3 flex items-center gap-3">
              <input type="file" accept="image/*" onChange={onFile} />
              {uploadMut.isPending && <span className="text-sm text-gray-500">Yükleniyor…</span>}
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {(data?.photos ?? []).map((url) => (
                <div key={url} className="relative group rounded-xl overflow-hidden border">
                  <img src={url} alt="photo" className="w-full h-40 object-cover" />
                  <button
                    onClick={() => removePhotoMut.mutate(url)}
                    disabled={removePhotoMut.isPending}
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
        )}

        {/* === MENÜLER === */}
        {tab === "menus" && (
          <Card title="Menüler">
            <div className="space-y-3">
              {menus.map((m, idx) => (
                <div
                  key={idx}
                  className="grid grid-cols-1 md:grid-cols-6 gap-3"
                >
                  {/* Ad */}
                  <input
                    className="border rounded-lg px-3 py-2"
                    placeholder="Ad"
                    value={m.name}
                    onChange={(e) =>
                      setMenus((prev) =>
                        prev.map((x, i) =>
                          i === idx ? { ...x, name: e.target.value } : x
                        )
                      )
                    }
                  />

                  {/* Fiyat */}
                  <input
                    type="number"
                    min={0}
                    className="border rounded-lg px-3 py-2"
                    placeholder="Fiyat"
                    value={String(m.price)}
                    onChange={(e) =>
                      setMenus((prev) =>
                        prev.map((x, i) =>
                          i === idx
                            ? { ...x, price: Number(e.target.value) || 0 }
                            : x
                        )
                      )
                    }
                  />

                  {/* Açıklama — geniş ve yüksek */}
                  <div className="md:col-span-3">
                    <textarea
                      className="w-full border rounded-lg px-3 py-2 h-24"
                      placeholder="Açıklama"
                      value={m.description || ""}
                      onChange={(e) =>
                        setMenus((prev) =>
                          prev.map((x, i) =>
                            i === idx ? { ...x, description: e.target.value } : x
                          )
                        )
                      }
                    />
                  </div>

                  {/* Aktif */}
                  <div className="flex items-center">
                    <label className="flex items-center gap-2 text-sm">
                      <span className="text-gray-600">Aktif</span>
                      <input
                        type="checkbox"
                        checked={m.isActive ?? true}
                        onChange={(e) =>
                          setMenus((prev) =>
                            prev.map((x, i) =>
                              i === idx ? { ...x, isActive: e.target.checked } : x
                            )
                          )
                        }
                      />
                    </label>
                  </div>

                  {/* Sil butonunu açıklama satırının altına taşımamak için ayrı satıra gerek kalmıyor */}
                  <div className="md:col-span-6">
                    <button
                      className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2"
                      onClick={() =>
                        setMenus((prev) => prev.filter((_, i) => i !== idx))
                      }
                    >
                      Sil
                    </button>
                  </div>
                </div>
              ))}
              {menus.length === 0 && (
                <div className="text-sm text-gray-500">Kayıt yok</div>
              )}
              <button
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
                onClick={() =>
                  setMenus((prev) => [
                    ...prev,
                    { name: "", price: 0, description: "", isActive: true },
                  ])
                }
              >
                Yeni Menü
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={() => saveMenusMut.mutate()}
                disabled={saveMenusMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {saveMenusMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === MASALAR === */}
        {tab === "tables" && (
          <Card title="Masalar">
            <div className="space-y-3">
              {tables.map((t, idx) => (
                <div key={idx} className="grid grid-cols-1 md:grid-cols-5 gap-3 items-center">
                  <input
                    className="border rounded-lg px-3 py-2"
                    placeholder="Ad"
                    value={t.name}
                    onChange={(e) =>
                      setTables((prev) => prev.map((x, i) => (i === idx ? { ...x, name: e.target.value } : x)))
                    }
                  />
                  <input
                    type="number"
                    min={1}
                    className="border rounded-lg px-3 py-2"
                    placeholder="Kapasite"
                    value={String(t.capacity)}
                    onChange={(e) =>
                      setTables((prev) =>
                        prev.map((x, i) => (i === idx ? { ...x, capacity: Number(e.target.value) || 1 } : x))
                      )
                    }
                  />
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Aktif</span>
                    <input
                      type="checkbox"
                      checked={t.isActive ?? true}
                      onChange={(e) =>
                        setTables((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, isActive: e.target.checked } : x))
                        )
                      }
                    />
                  </label>
                  <button
                    className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2"
                    onClick={() => setTables((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    Sil
                  </button>
                </div>
              ))}
              {tables.length === 0 && <div className="text-sm text-gray-500">Kayıt yok</div>}
              <button
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
                onClick={() =>
                  setTables((prev) => [...prev, { name: `Masa ${prev.length + 1}`, capacity: 2, isActive: true }])
                }
              >
                Yeni Masa
              </button>
            </div>

            <div className="mt-4">
              <button
                onClick={() => saveTablesMut.mutate()}
                disabled={saveTablesMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {saveTablesMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === SAATLER === */}
        {tab === "hours" && (
          <Card title="Çalışma Saatleri">
            <div className="space-y-3">
              {hours.map((h, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <div className="w-20 text-sm text-gray-600">{DAYS[h.day] ?? `Gün ${h.day}`}</div>
                  <label className="flex items-center gap-2 text-sm">
                    <span className="text-gray-600">Kapalı</span>
                    <input
                      type="checkbox"
                      checked={!!h.isClosed}
                      onChange={(e) =>
                        setHours((prev) =>
                          prev.map((x, i) => (i === idx ? { ...x, isClosed: e.target.checked } : x))
                        )
                      }
                    />
                  </label>
                  <input
                    type="time"
                    className="border rounded-lg px-3 py-2"
                    value={h.open}
                    disabled={!!h.isClosed}
                    onChange={(e) =>
                      setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, open: e.target.value } : x)))
                    }
                  />
                  <span>—</span>
                  <input
                    type="time"
                    className="border rounded-lg px-3 py-2"
                    value={h.close}
                    disabled={!!h.isClosed}
                    onChange={(e) =>
                      setHours((prev) => prev.map((x, i) => (i === idx ? { ...x, close: e.target.value } : x)))
                    }
                  />
                </div>
              ))}
            </div>

            <div className="mt-4">
              <button
                onClick={() => saveHoursMut.mutate()}
                disabled={saveHoursMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {saveHoursMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}

        {/* === POLİTİKALAR === */}
        {tab === "policies" && (
          <Card title="Rezervasyon Politikaları">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Minimum kişi</label>
                <input
                  type="number"
                  min={1}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.minPartySize)}
                  onChange={(e) =>
                    setPolicies((p) => ({ ...p, minPartySize: Math.max(1, Number(e.target.value) || 1) }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Maksimum kişi</label>
                <input
                  type="number"
                  min={policies.minPartySize}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.maxPartySize)}
                  onChange={(e) =>
                    setPolicies((p) => ({
                      ...p,
                      maxPartySize: Math.max(p.minPartySize, Number(e.target.value) || p.minPartySize),
                    }))
                  }
                />
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Slot süresi (dk)</label>
                <input
                  type="number"
                  min={30}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  value={String(policies.slotMinutes)}
                  onChange={(e) =>
                    setPolicies((p) => ({ ...p, slotMinutes: Math.max(30, Number(e.target.value) || 30) }))
                  }
                />
              </div>
            </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
      <div>
        <label className="block text-sm text-gray-600 mb-1">
          Check-in Penceresi (ÖNCE, dk)
        </label>
        <input
          type="number"
          min={0}
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          value={String(policies.checkinWindowBeforeMinutes)}
          onChange={(e) =>
            setPolicies((p) => ({
              ...p,
              checkinWindowBeforeMinutes: Math.max(0, Number(e.target.value) || 0),
            }))
          }
        />
        <div className="text-xs text-gray-500 mt-1">
          Rezervasyon saatinden <b>önce</b> kaç dakika içinde giriş kabul edilir.
        </div>
      </div>

      <div>
        <label className="block text-sm text-gray-600 mb-1">
          Check-in Penceresi (SONRA, dk)
        </label>
        <input
          type="number"
          min={0}
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          value={String(policies.checkinWindowAfterMinutes)}
          onChange={(e) =>
            setPolicies((p) => ({
              ...p,
              checkinWindowAfterMinutes: Math.max(0, Number(e.target.value) || 0),
            }))
          }
        />
        <div className="text-xs text-gray-500 mt-1">
          Rezervasyon saatinden <b>sonra</b> kaç dakika içinde giriş kabul edilir.
        </div>
      </div>
    </div>
            <div className="mt-4 flex items-center gap-4">
              <label className="flex items-center gap-2 text-sm">
                <span className="text-gray-600">Depozito gerekli</span>
                <input
                  type="checkbox"
                  checked={!!policies.depositRequired}
                  onChange={(e) => setPolicies((p) => ({ ...p, depositRequired: e.target.checked }))}
                />
              </label>
              {policies.depositRequired && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-600">Tutar (₺)</span>
                  <input
                    type="number"
                    min={0}
                    className="rounded-lg border border-gray-300 px-3 py-2 w-40"
                    value={String(policies.depositAmount)}
                    onChange={(e) =>
                      setPolicies((p) => ({ ...p, depositAmount: Math.max(0, Number(e.target.value) || 0) }))
                    }
                  />
                </div>
              )}
            </div>

            <div className="mt-6">
              <div className="mb-2 font-medium">Kara Günler (YYYY-MM-DD)</div>
              <div className="flex flex-wrap gap-2 mb-3">
                {policies.blackoutDates.length === 0 && (
                  <div className="text-sm text-gray-500">Liste boş.</div>
                )}
                {policies.blackoutDates.map((d, i) => (
                  <div
                    key={`${d}-${i}`}
                    className="flex items-center gap-2 bg-gray-100 rounded-md px-2 py-1"
                  >
                    <span>{d}</span>
                    <button
                      className="text-red-600"
                      onClick={() =>
                        setPolicies((p) => ({
                          ...p,
                          blackoutDates: p.blackoutDates.filter((_, idx) => idx !== i),
                        }))
                      }
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-2">
                <input
                  placeholder="2025-12-31"
                  className="rounded-lg border border-gray-300 px-3 py-2"
                  value={newBlackout}
                  onChange={(e) => setNewBlackout(e.target.value)}
                />
                <button
                  className="rounded-lg bg-gray-100 hover:bg-gray-200 px-3 py-2"
                  onClick={() => {
                    const v = newBlackout.trim();
                    if (v && !policies.blackoutDates.includes(v)) {
                      setPolicies((p) => ({ ...p, blackoutDates: [...p.blackoutDates, v] }));
                      setNewBlackout("");
                    }
                  }}
                >
                  Ekle
                </button>
              </div>
            </div>

            <div className="mt-4">
              <button
                onClick={() => savePoliciesMut.mutate()}
                disabled={savePoliciesMut.isPending}
                className="rounded-lg bg-brand-600 hover:bg-brand-700 text-white px-4 py-2"
              >
                {savePoliciesMut.isPending ? "Kaydediliyor…" : "Kaydet"}
              </button>
            </div>
          </Card>
        )}
      </div>
    </div>
  );
}
